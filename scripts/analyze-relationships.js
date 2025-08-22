#!/usr/bin/env node

/**
 * Relationship Pattern Analysis Script
 * 
 * This script systematically analyzes all TypeScript files in the packages/
 * directory to identify relationship patterns used in the codebase. It extracts
 * both graph relationships (-[:TYPE]->) and foreign key property patterns
 * to support the schema design migration.
 * 
 * Usage: node scripts/analyze-relationships.js
 * Output: CSV file with relationship inventory data
 */

const fs = require('fs');
const path = require('path');

class RelationshipAnalyzer {
  constructor(options = {}) {
    this.relationships = new Map();
    this.foreignKeys = new Map();
    this.findings = [];
    this.mixedPatterns = new Map();
    this.outDir = options.outDir || path.resolve(__dirname, '..', 'docs', 'schema-design');
    
    // FK to relationship mapping for enhanced mixed-pattern detection
    this.fkToRelationshipMap = {
      ownerId: { source: 'User', rel: 'OWNS', target: 'Starship' },
      starshipId: { source: 'Agent', rel: 'DEPLOYED_ON', target: 'Starship' },
      templateId: { source: 'MCPServerConnector', rel: 'CREATED_FROM', target: 'MCPServerOption' },
      authorId: { source: 'User', rel: 'AUTHORS', target: 'Agent' }
    };
    
    // Regex patterns for different relationship types
    this.patterns = {
      // Graph relationship patterns: <-[:TYPE]-, -[:TYPE]->, and -[:TYPE]-
      // Capture <-[:TYPE]- , -[:TYPE]-> , and -[:TYPE]-
      graphRelationship: /(?:<\-\[(?:\w*\s*:\s*)?(\w+)[^\]]*\]\-)|(?:\-\[(?:\w*\s*:\s*)?(\w+)[^\]]*\]\->)|(?:\-\[(?:\w*\s*:\s*)?(\w+)[^\]]*\]\-)/g,
      
      // Foreign key property patterns: entity.someId = $value
      foreignKeyFilter: /(\w+)\.(\w+Id)\s*[=!]/g,
      
      // Property access patterns: WHERE entity.someId
      propertyAccess: /WHERE\s+(\w+)\.(\w+Id)/gi
    };
  }

  /**
   * Main analysis entry point
   */
  async analyze() {
    console.log('🔍 Starting relationship pattern analysis...');
    
    const packagesDir = path.join(process.cwd(), 'packages');
    if (!fs.existsSync(packagesDir)) {
      console.error('❌ packages/ directory not found');
      process.exit(1);
    }

    // Find all TypeScript files
    const tsFiles = this.findTypeScriptFiles(packagesDir);
    console.log(`📁 Found ${tsFiles.length} TypeScript files to analyze`);

    // Analyze each file
    for (const filePath of tsFiles) {
      await this.analyzeFile(filePath);
    }

    // Generate summary
    this.generateSummary();
    
    // Export results
    this.exportToCsv();
    this.exportToJson();
    this.exportMixedPatterns();
    
    console.log('✅ Analysis complete!');
  }

  /**
   * Recursively find all TypeScript files
   */
  findTypeScriptFiles(dir) {
    const files = [];
    
    const walk = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip node_modules and build directories
          if (!['node_modules', 'dist', 'build', '.git'].includes(item)) {
            walk(fullPath);
          }
        } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    };
    
    walk(dir);
    return files;
  }

  /**
   * Analyze a single TypeScript file for relationship patterns
   */
  async analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);
      
      // Extract domain from file path
      const domain = this.extractDomain(relativePath);
      
      // Find Cypher queries (strings containing MATCH, CREATE, etc.)
      const cypherQueries = this.extractCypherQueries(content);
      
      for (const query of cypherQueries) {
        this.analyzeQuery(query, relativePath, domain);
      }
      
    } catch (error) {
      console.warn(`⚠️  Warning: Could not analyze ${filePath}: ${error.message}`);
    }
  }

  /**
   * Extract domain name from file path
   */
  extractDomain(filePath) {
    if (filePath.includes('repositories')) {
      const match = filePath.match(/repositories\/(\w+)Repository/);
      if (match) return match[1];
    }
    
    if (filePath.includes('types.ts')) return 'Types';
    if (filePath.includes('User')) return 'User';
    if (filePath.includes('Starship')) return 'Starship';
    if (filePath.includes('Agent')) return 'Agent';
    if (filePath.includes('Connector')) return 'Connector';
    if (filePath.includes('Vision')) return 'Vision';
    
    return 'Unknown';
  }

  /**
   * Extract Cypher queries from TypeScript content, focusing on query-call contexts
   * 
   * LIMITATIONS: This heuristic approach identifies strings with Cypher keywords
   * near executeQuery/executeWrite calls. It may miss some queries or include
   * false positives. For comprehensive analysis, consider using a full AST parser.
   */
  extractCypherQueries(content) {
    const queries = [];
    
    // Look for lines that contain execute methods
    const executeLines = content.split('\n').map((line, index) => ({
      line: line.trim(),
      index,
      hasExecute: /execute(Query|Write|Read)/i.test(line)
    })).filter(item => item.hasExecute);
    
    if (executeLines.length === 0) {
      // Fallback: look for strings with multiple Cypher keywords if no execute calls found
      return this.extractCypherQueriesFallback(content);
    }
    
    // For each execute call, find nearby string literals
    const lines = content.split('\n');
    
    for (const executeLine of executeLines) {
      // Search in a window around the execute call
      const windowStart = Math.max(0, executeLine.index - 10);
      const windowEnd = Math.min(lines.length, executeLine.index + 10);
      
      const windowContent = lines.slice(windowStart, windowEnd).join('\n');
      
      // Find template literals and strings in this window
      const templateLiterals = windowContent.match(/`[^`]*`/gs) || [];
      const strings = windowContent.match(/'[^']*'/gs) || [];
      const doubleQuoteStrings = windowContent.match(/"[^"]*"/gs) || [];
      
      const windowStrings = [...templateLiterals, ...strings, ...doubleQuoteStrings];
      
      for (const str of windowStrings) {
        if (this.likelyCypherQuery(str)) {
          const cleaned = str.replace(/^[`"']|[`"']$/g, '');
          // Avoid duplicates
          if (!queries.includes(cleaned)) {
            queries.push(cleaned);
          }
        }
      }
    }
    
    return queries;
  }

  /**
   * Fallback method for extracting Cypher queries when no execute calls are found
   */
  extractCypherQueriesFallback(content) {
    const queries = [];
    
    // Look for template literals and strings containing multiple Cypher keywords
    const templateLiterals = content.match(/`[^`]*`/gs) || [];
    const strings = content.match(/'[^']*'/gs) || [];
    const doubleQuoteStrings = content.match(/"[^"]*"/gs) || [];
    
    const allStrings = [...templateLiterals, ...strings, ...doubleQuoteStrings];
    
    for (const str of allStrings) {
      if (this.likelyCypherQuery(str, true)) { // Stricter check for fallback
        const cleaned = str.replace(/^[`"']|[`"']$/g, '');
        queries.push(cleaned);
      }
    }
    
    return queries;
  }

  /**
   * Determine if a string is likely a Cypher query
   */
  likelyCypherQuery(str, strict = false) {
    const cypherKeywords = ['MATCH', 'CREATE', 'SET', 'WHERE', 'RETURN', 'DELETE', 'WITH', 'MERGE'];
    const upperStr = str.toUpperCase();
    
    // Count how many Cypher keywords are present
    const keywordCount = cypherKeywords.filter(keyword => 
      upperStr.includes(keyword)
    ).length;
    
    // In strict mode (fallback), require at least 2 keywords
    // In normal mode, 1 keyword is enough if near an execute call
    const minKeywords = strict ? 2 : 1;
    
    // Additional heuristics to filter out false positives
    const hasGraphPatterns = /-\[.*?\]->/i.test(str) || /\(.*?\)/i.test(str);
    const isTooShort = str.length < 10;
    const looksLikeComment = str.trim().startsWith('//') || str.trim().startsWith('/*');
    
    return keywordCount >= minKeywords && 
           !isTooShort && 
           !looksLikeComment &&
           (hasGraphPatterns || keywordCount >= 2);
  }

  /**
   * Analyze a single Cypher query for relationship patterns
   */
  analyzeQuery(query, filePath, domain) {
    const context = this.extractQueryContext(query);
    
    // Find graph relationships
    this.findGraphRelationships(query, filePath, domain, context);
    
    // Find foreign key patterns
    this.findForeignKeyPatterns(query, filePath, domain, context);
  }

  /**
   * Extract context information from the query
   */
  extractQueryContext(query) {
    // Try to determine what the query is doing
    if (query.toUpperCase().includes('CREATE')) return 'creation';
    if (query.toUpperCase().includes('DELETE')) return 'deletion';
    if (query.toUpperCase().includes('SET')) return 'update';
    if (query.toUpperCase().includes('MATCH') && query.toUpperCase().includes('RETURN')) return 'query';
    return 'unknown';
  }

  /**
   * Find graph relationship patterns in the query
   */
  findGraphRelationships(query, filePath, domain, context) {
    const matches = query.matchAll(this.patterns.graphRelationship);
    
    for (const match of matches) {
      const relationshipType = match[1] || match[2] || match[3] || 'UNKNOWN';
      
      // Try to extract source and target nodes
      const { sourceNode, targetNode } = this.extractNodeTypes(query, match.index);
      
      const finding = {
        type: 'graph_relationship',
        domain,
        filePath,
        sourceNode,
        targetNode,
        relationshipType,
        context,
        query: query.substring(Math.max(0, match.index - 50), match.index + 100)
      };
      
      this.findings.push(finding);
      
      // Track relationship usage
      const key = `${sourceNode}-${relationshipType}-${targetNode}`;
      if (!this.relationships.has(key)) {
        this.relationships.set(key, []);
      }
      this.relationships.get(key).push(finding);
    }
  }

  /**
   * Find foreign key patterns in the query
   */
  findForeignKeyPatterns(query, filePath, domain, context) {
    const fkMatches = query.matchAll(this.patterns.foreignKeyFilter);
    const propMatches = query.matchAll(this.patterns.propertyAccess);
    
    const allMatches = [...fkMatches, ...propMatches];
    
    for (const match of allMatches) {
      const nodeType = match[1];
      const fkProperty = match[2];
      
      const finding = {
        type: 'foreign_key',
        domain,
        filePath,
        nodeType,
        fkProperty,
        context,
        query: query.substring(Math.max(0, match.index - 50), match.index + 100)
      };
      
      this.findings.push(finding);
      
      // Track FK usage
      const key = `${nodeType}.${fkProperty}`;
      if (!this.foreignKeys.has(key)) {
        this.foreignKeys.set(key, []);
      }
      this.foreignKeys.get(key).push(finding);
    }
  }

  /**
   * Extract node types from relationship context
   * Improved to handle multi-label nodes, whitespace variations, and reversed edges
   */
  extractNodeTypes(query, relationshipIndex) {
    // Find the nearest preceding and following (...) blocks regardless of ->/<-
    const beforeRelationship = query.substring(0, relationshipIndex);
    const afterRelationship = query.substring(relationshipIndex);
    
    // Find source node (look backwards for any (...) pattern)
    // Parse labels using /\((?:\w+):([\w:]+)/ and take the first label before any :
    const sourceMatches = beforeRelationship.match(/\([^)]*\)/g);
    let sourceNode = 'Unknown';
    if (sourceMatches && sourceMatches.length > 0) {
      const lastSourceMatch = sourceMatches[sourceMatches.length - 1];
      const labelMatch = lastSourceMatch.match(/\((?:\w+):([\w:]+)/);
      if (labelMatch) {
        // Take the first label before any : separator
        sourceNode = labelMatch[1].split(':')[0];
      }
    }
    
    // Find target node (look forwards for any (...) pattern)
    const targetMatches = afterRelationship.match(/\([^)]*\)/g);
    let targetNode = 'Unknown';
    if (targetMatches && targetMatches.length > 0) {
      const firstTargetMatch = targetMatches[0];
      const labelMatch = firstTargetMatch.match(/\((?:\w+):([\w:]+)/);
      if (labelMatch) {
        // Take the first label before any : separator
        targetNode = labelMatch[1].split(':')[0];
      }
    }
    
    return { sourceNode, targetNode };
  }

  /**
   * Generate analysis summary
   */
  generateSummary() {
    console.log('\n📊 Relationship Analysis Summary:');
    console.log('=====================================');
    
    console.log(`\n🔗 Graph Relationships Found: ${this.relationships.size}`);
    for (const [key, usages] of this.relationships.entries()) {
      console.log(`  ${key}: ${usages.length} usage(s)`);
    }
    
    console.log(`\n🔑 Foreign Key Patterns Found: ${this.foreignKeys.size}`);
    for (const [key, usages] of this.foreignKeys.entries()) {
      console.log(`  ${key}: ${usages.length} usage(s)`);
    }
    
    // Domain breakdown
    const domainCounts = new Map();
    for (const finding of this.findings) {
      domainCounts.set(finding.domain, (domainCounts.get(finding.domain) || 0) + 1);
    }
    
    console.log(`\n📂 Findings by Domain:`);
    for (const [domain, count] of domainCounts.entries()) {
      console.log(`  ${domain}: ${count} pattern(s)`);
    }
    
    // Mixed pattern analysis
    console.log(`\n🔄 Mixed Pattern Analysis:`);
    this.analyzeMixedPatterns();
  }

  /**
   * Analyze where FK and relationship patterns are mixed
   */
  analyzeMixedPatterns() {
    // Normalize patterns to detect mixed usage
    const normalizedPatterns = new Map();
    
    for (const finding of this.findings) {
      let normalizedKey;
      
      if (finding.type === 'graph_relationship') {
        // Use relationship pattern as key
        normalizedKey = `${finding.sourceNode}-${finding.relationshipType}-${finding.targetNode}`;
      } else if (finding.type === 'foreign_key') {
        // Map FK to equivalent relationship pattern using fkToRelationshipMap
        const fkMapping = this.fkToRelationshipMap[finding.fkProperty];
        if (fkMapping) {
          normalizedKey = `${fkMapping.source}-${fkMapping.rel}-${fkMapping.target}`;
        } else {
          // Fallback to simple heuristic
          const targetGuess = finding.fkProperty.replace('Id', '');
          normalizedKey = `${finding.nodeType}-FK-${targetGuess}`;
        }
      }
      
      if (normalizedKey) {
        if (!normalizedPatterns.has(normalizedKey)) {
          normalizedPatterns.set(normalizedKey, { 
            key: normalizedKey,
            graph: [], 
            fk: [],
            exampleFiles: new Set(),
            fkProperty: finding.type === 'foreign_key' ? finding.fkProperty : null
          });
        }
        
        const pattern = normalizedPatterns.get(normalizedKey);
        
        if (finding.type === 'graph_relationship') {
          pattern.graph.push(finding);
        } else {
          pattern.fk.push(finding);
          pattern.fkProperty = finding.fkProperty;
        }
        
        pattern.exampleFiles.add(finding.filePath);
      }
    }
    
    // Store for export
    this.mixedPatterns = normalizedPatterns;
    
    // Find patterns that use both approaches and report them
    for (const [key, patterns] of normalizedPatterns.entries()) {
      if (patterns.graph.length > 0 && patterns.fk.length > 0) {
        console.log(`  ⚠️  ${key}: Uses both graph (${patterns.graph.length}) and FK (${patterns.fk.length}) patterns (FK: ${patterns.fkProperty})`);
      }
    }
  }

  /**
   * Export results to CSV
   */
  exportToCsv() {
    const csvRows = [
      'Domain,Source Node,Target Node,Relationship Type,FK Property,Repository Usage,Query Pattern,Context,File Path'
    ];
    
    for (const finding of this.findings) {
      const row = [
        finding.domain,
        finding.sourceNode || finding.nodeType || '',
        finding.targetNode || '',
        finding.relationshipType || '',
        finding.fkProperty || '',
        finding.type,
        `"${finding.query.replace(/"/g, '""')}"`,
        finding.context,
        finding.filePath
      ].join(',');
      
      csvRows.push(row);
    }
    
    const csvContent = csvRows.join('\n');
    
    // Ensure output directory exists
    fs.mkdirSync(this.outDir, { recursive: true });
    
    const outputPath = path.join(this.outDir, 'relationship-analysis.csv');
    fs.writeFileSync(outputPath, csvContent);
    console.log(`📄 CSV exported to: ${outputPath}`);
  }

  /**
   * Test relationship regex patterns
   */
  static testRegexPatterns() {
    console.log('🧪 Testing relationship regex patterns...');
    
    const testCases = [
      // Test cases for graphRelationship pattern
      { input: '-[:TYPE]->', expected: ['TYPE'], description: 'Simple outgoing relationship' },
      { input: '-[r:TYPE]->', expected: ['TYPE'], description: 'Outgoing with variable r' },  
      { input: '-[rel:TYPE {p:1}]->', expected: ['TYPE'], description: 'Outgoing with properties' },
      { input: '-[:OWNS]->', expected: ['OWNS'], description: 'OWNS outgoing relationship' },
      { input: '-[relationship:DEPLOYED_ON]->', expected: ['DEPLOYED_ON'], description: 'Long variable name outgoing' },
      { input: '-[ : TYPE ]->', expected: ['TYPE'], description: 'Outgoing with spaces' },
      // New test cases for incoming relationships
      { input: '<-[:TYPE]-', expected: ['TYPE'], description: 'Simple incoming relationship' },
      { input: '<-[r:OWNS]-', expected: ['OWNS'], description: 'Incoming OWNS relationship' },
      { input: '<-[:DEPLOYED_ON]-', expected: ['DEPLOYED_ON'], description: 'Incoming DEPLOYED_ON relationship' },
      // New test cases for undirected relationships
      { input: '-[:TYPE]-', expected: ['TYPE'], description: 'Simple undirected relationship' },
      { input: '-[r:CONNECTS]-', expected: ['CONNECTS'], description: 'Undirected CONNECTS relationship' }
    ];
    
    const analyzer = new RelationshipAnalyzer();
    const regex = analyzer.patterns.graphRelationship;
    
    let allPassed = true;
    
    for (const testCase of testCases) {
      // Reset regex lastIndex for global regex
      regex.lastIndex = 0;
      const matches = Array.from(testCase.input.matchAll(regex));
      const actual = matches.map(match => match[1] || match[2] || match[3]).filter(Boolean);
      
      const passed = JSON.stringify(actual) === JSON.stringify(testCase.expected);
      allPassed = allPassed && passed;
      
      console.log(`  ${passed ? '✅' : '❌'} ${testCase.description}: "${testCase.input}"`);
      if (!passed) {
        console.log(`    Expected: ${JSON.stringify(testCase.expected)}`);
        console.log(`    Actual: ${JSON.stringify(actual)}`);
      }
    }
    
    return allPassed;
  }

  /**
   * Export results to JSON for further analysis
   */
  exportToJson() {
    const data = {
      summary: {
        totalFindings: this.findings.length,
        graphRelationships: this.relationships.size,
        foreignKeyPatterns: this.foreignKeys.size,
        generatedAt: new Date().toISOString()
      },
      relationships: Object.fromEntries(this.relationships),
      foreignKeys: Object.fromEntries(this.foreignKeys),
      findings: this.findings
    };
    
    // Ensure output directory exists
    fs.mkdirSync(this.outDir, { recursive: true });
    
    const outputPath = path.join(this.outDir, 'relationship-analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`📄 JSON exported to: ${outputPath}`);
  }

  /**
   * Export mixed pattern results to JSON and CSV
   */
  exportMixedPatterns() {
    // Export mixed patterns to JSON
    const mixedPatternsData = {};
    for (const [key, pattern] of this.mixedPatterns.entries()) {
      mixedPatternsData[key] = {
        key: pattern.key,
        graphCount: pattern.graph.length,
        fkCount: pattern.fk.length,
        exampleFiles: Array.from(pattern.exampleFiles),
        graphFindings: pattern.graph,
        fkFindings: pattern.fk
      };
    }

    // Ensure output directory exists
    fs.mkdirSync(this.outDir, { recursive: true });
    
    // Export JSON
    const jsonOutputPath = path.join(this.outDir, 'mixed-patterns.json');
    fs.writeFileSync(jsonOutputPath, JSON.stringify(mixedPatternsData, null, 2));
    console.log(`📄 Mixed patterns JSON exported to: ${jsonOutputPath}`);

    // Export CSV
    const csvRows = [
      'key,graph_count,fk_count,example_files'
    ];

    for (const [key, pattern] of this.mixedPatterns.entries()) {
      const row = [
        key,
        pattern.graph.length,
        pattern.fk.length,
        `"${Array.from(pattern.exampleFiles).join('; ')}"`
      ].join(',');
      
      csvRows.push(row);
    }

    const csvContent = csvRows.join('\n');
    const csvOutputPath = path.join(this.outDir, 'mixed-patterns.csv');
    fs.writeFileSync(csvOutputPath, csvContent);
    console.log(`📄 Mixed patterns CSV exported to: ${csvOutputPath}`);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--outDir' && i + 1 < args.length) {
      options.outDir = path.resolve(args[i + 1]);
      i++; // Skip next argument as it's the value for --outDir
    } else if (arg === '--test') {
      options.runTests = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Relationship Pattern Analysis Script

Usage: node scripts/analyze-relationships.js [options]

Options:
  --outDir <path>    Output directory for analysis files (default: docs/schema-design)
  --test             Run regex pattern unit tests
  --help, -h         Show this help message

Examples:
  node scripts/analyze-relationships.js
  node scripts/analyze-relationships.js --outDir ./custom-output
  node scripts/analyze-relationships.js --test
      `);
      process.exit(0);
    } else if (arg.startsWith('--')) {
      console.warn(`⚠️  Unknown option: ${arg}`);
    }
  }
  
  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  
  if (options.runTests) {
    // Run regex pattern tests
    const passed = RelationshipAnalyzer.testRegexPatterns();
    if (passed) {
      console.log('✅ All regex pattern tests passed!');
    } else {
      console.log('❌ Some regex pattern tests failed!');
      process.exit(1);
    }
    return;
  }
  
  const analyzer = new RelationshipAnalyzer(options);
  
  if (options.outDir) {
    console.log(`📁 Using output directory: ${options.outDir}`);
  }
  
  analyzer.analyze().catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
}

module.exports = RelationshipAnalyzer;