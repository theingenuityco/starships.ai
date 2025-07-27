# MCP Tool Usage Guide for Agents

This guide provides comprehensive patterns and best practices for using MCP tools within LangChain agents.

## Table of Contents
1. [Sequential Thinking Pattern](#sequential-thinking-pattern)
2. [Memory Integration Pattern](#memory-integration-pattern)
3. [Web Automation Pattern](#web-automation-pattern)
4. [Combined Patterns](#combined-patterns)
5. [Best Practices](#best-practices)
6. [Error Handling](#error-handling)

## Sequential Thinking Pattern

Sequential Thinking is used for complex reasoning tasks that require step-by-step analysis.

### When to Use
- Breaking down complex problems
- Systematic analysis of requirements
- Multi-step reasoning tasks
- Decision-making with multiple factors

### Example Usage

```typescript
// Problem: Design a microservices architecture
const problem = "Design a scalable microservices architecture for an e-commerce platform";

// Step 1: Understand requirements
const thought1 = await mcpGateway.invokeTool(starshipId, 'sequentialthinking', {
  thought: "First, I need to identify the core business domains: user management, product catalog, orders, payments, and shipping",
  thoughtNumber: 1,
  totalThoughts: 5,
  nextThoughtNeeded: true
});

// Step 2: Analyze patterns
const thought2 = await mcpGateway.invokeTool(starshipId, 'sequentialthinking', {
  thought: "Next, I'll determine service boundaries based on domain-driven design principles",
  thoughtNumber: 2,
  totalThoughts: 5,
  nextThoughtNeeded: true
});

// Continue until complete...
```

### Integration with Agents

```typescript
const sequentialThinkingTool = new DynamicTool({
  name: 'complex_reasoning',
  description: 'Use for problems requiring systematic step-by-step analysis',
  func: async (input: string) => {
    const { problem, maxSteps = 5 } = JSON.parse(input);
    const thoughts = [];
    
    for (let i = 1; i <= maxSteps; i++) {
      const result = await mcpGateway.invokeTool(starshipId, 'sequentialthinking', {
        thought: `Analyzing ${problem} - Step ${i}`,
        thoughtNumber: i,
        totalThoughts: maxSteps,
        nextThoughtNeeded: i < maxSteps
      });
      
      if (result.success) {
        thoughts.push(result.result);
      }
    }
    
    return thoughts.join('\n\n');
  }
});
```

## Memory Integration Pattern

Memory tools enable context persistence across tasks and conversations.

### When to Use
- Storing task results for future reference
- Maintaining conversation context
- Building agent knowledge base
- Tracking performance metrics

### Key Patterns

#### 1. Context Management
```typescript
// Store expedition context
await memoryPattern.storeExpeditionContext(expeditionId, {
  objective: "Implement user authentication",
  techStack: ["Node.js", "JWT", "PostgreSQL"],
  constraints: ["GDPR compliance", "OAuth support"]
});

// Retrieve in future tasks
const context = await memoryPattern.getExpeditionContext(expeditionId);
```

#### 2. Task Result Persistence
```typescript
// Store task results
await memoryPattern.storeTaskResult(taskId, {
  implementation: "JWT-based authentication service",
  endpoints: ["/auth/login", "/auth/refresh", "/auth/logout"],
  testCoverage: "85%"
});

// Retrieve for dependent tasks
const previousResult = await memoryPattern.getTaskResult(dependencyTaskId);
```

#### 3. Agent Learning
```typescript
// Store insights
await memoryPattern.storeAgentInsight(agentId, 'security_pattern', {
  pattern: "Always hash [DEFAULT-PASSWORD]s with bcrypt",
  context: "User authentication implementation",
  confidence: 0.95
});

// Apply learnings in future tasks
const insights = await memoryPattern.getAgentInsights(agentId, 'security_pattern');
```

#### 4. Conversation History
```typescript
// Maintain conversation context
await memoryPattern.appendToConversation(conversationId, {
  role: 'user',
  content: 'Add rate limiting to the API',
  timestamp: new Date().toISOString()
});

const history = await memoryPattern.getConversation(conversationId);
```

## Web Automation Pattern

Web automation tools enable data extraction, form filling, and web interaction.

### When to Use
- Research and competitive analysis
- Data extraction from websites
- Automated testing of web applications
- Screenshot documentation

### Key Patterns

#### 1. Data Extraction
```typescript
// Extract structured data
const productData = await webPattern.extractData('https://example.com/product', {
  title: 'h1.product-title',
  price: '.price-tag',
  description: '.product-description',
  availability: '.stock-status'
});
```

#### 2. Form Automation
```typescript
// Fill and submit forms
const submitted = await webPattern.fillForm(
  'https://example.com/contact',
  {
    '#name': 'John Doe',
    '#email': 'john@example.com',
    '#message': 'Inquiry about enterprise pricing'
  },
  '#submit-button'
);
```

#### 3. Table Data Extraction
```typescript
// Extract table data for analysis
const tableData = await webPattern.extractTable(
  'https://example.com/pricing',
  'table.pricing-table'
);

// Process the data
const pricingTiers = tableData.slice(1).map(row => ({
  plan: row[0],
  price: row[1],
  features: row[2]
}));
```

#### 4. Multi-Page Screenshots
```typescript
// Document multiple pages
const screenshots = await webPattern.capturePages(
  [
    'https://app.example.com/dashboard',
    'https://app.example.com/settings',
    'https://app.example.com/reports'
  ],
  '/tmp/documentation'
);
```

## Combined Patterns

Real-world tasks often require combining multiple MCP tools.

### Example: Competitive Analysis Task

```typescript
async function analyzeCompetitor(competitorUrl: string) {
  // Step 1: Use Sequential Thinking to plan approach
  const plan = await sequentialThinking("Plan competitive analysis approach");
  
  // Step 2: Extract competitor data
  const competitorData = await webPattern.extractData(competitorUrl, {
    features: '.feature-list',
    pricing: '.pricing-info',
    testimonials: '.testimonials'
  });
  
  // Step 3: Store findings in memory
  await memoryPattern.storeAgentInsight('competitor_analysis', 'features', {
    competitor: competitorUrl,
    data: competitorData,
    analysisDate: new Date()
  });
  
  // Step 4: Take screenshots for documentation
  const screenshots = await webPattern.capturePages([competitorUrl], './analysis');
  
  // Step 5: Use Sequential Thinking to synthesize findings
  const synthesis = await sequentialThinking("Synthesize competitive analysis findings");
  
  return {
    plan,
    data: competitorData,
    screenshots,
    synthesis
  };
}
```

### Example: Research and Report Task

```typescript
async function researchAndReport(topic: string) {
  // Retrieve previous research if available
  const previousResearch = await memoryPattern.retrieve(`research:${topic}`);
  
  // Plan research approach
  const researchPlan = await sequentialThinking(`Plan research for ${topic}`);
  
  // Conduct web research
  const searchResults = await webPattern.searchAndExtract(
    'https://search.example.com',
    '#search-input',
    '#search-button',
    topic,
    '.search-result'
  );
  
  // Store findings
  await memoryPattern.store(`research:${topic}`, {
    previousResearch,
    newFindings: searchResults,
    timestamp: new Date()
  });
  
  // Generate report using Sequential Thinking
  const report = await sequentialThinking("Generate comprehensive research report");
  
  return report;
}
```

## Best Practices

### 1. Tool Selection
- Use Sequential Thinking for complex reasoning and planning
- Use Memory for context that needs to persist
- Use Web Automation for external data gathering

### 2. Error Handling
```typescript
try {
  const result = await mcpGateway.invokeTool(starshipId, toolName, params);
  if (!result.success) {
    // Fallback to alternative approach
    return await alternativeApproach();
  }
  return result.result;
} catch (error) {
  // Log error context for debugging
  await memoryPattern.storeErrorContext(errorId, error, { toolName, params });
  throw error;
}
```

### 3. Performance Optimization
- Cache frequently accessed data in memory
- Batch web automation tasks when possible
- Use appropriate timeouts for different tool types

### 4. Context Management
```typescript
// Always check for existing context
const existingContext = await memoryPattern.retrieve(contextKey);
if (existingContext) {
  // Build upon existing work
  return enhanceExistingWork(existingContext);
}
```

## Error Handling

### Common Error Scenarios

1. **Tool Timeout**
```typescript
const result = await mcpGateway.invokeTool(starshipId, 'sequentialthinking', params, {
  timeout: 120000 // 2 minutes for complex reasoning
});
```

2. **Service Unavailable**
```typescript
const availability = await mcpGateway.checkToolAvailability(starshipId, 'memory');
if (!availability) {
  // Use fallback local storage
  return useLocalStorage();
}
```

3. **Invalid Input**
```typescript
try {
  const validatedInput = validateToolInput(toolName, input);
  return await mcpGateway.invokeTool(starshipId, toolName, validatedInput);
} catch (validationError) {
  return `Invalid input: ${validationError.message}`;
}
```

### Retry Strategies

```typescript
async function invokeWithRetry(toolName: string, params: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await mcpGateway.invokeTool(starshipId, toolName, params);
      if (result.success) return result;
      
      // Log failure for analysis
      await memoryPattern.storePerformanceMetric('tool_failure', 1, {
        tool: toolName,
        attempt: String(attempt)
      });
      
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
```

## Summary

MCP tools provide powerful capabilities for LangChain agents:

1. **Sequential Thinking** - For complex reasoning and systematic analysis
2. **Memory** - For context persistence and knowledge building
3. **Web Automation** - For data extraction and web interaction

By combining these patterns, agents can tackle complex tasks that require reasoning, memory, and external data gathering. Always consider error handling, performance optimization, and proper context management when implementing these patterns.