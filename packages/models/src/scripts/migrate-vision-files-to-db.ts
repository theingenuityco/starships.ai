#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { createConnection, getConnection } from '../connection';
import { VisionRepository } from '../repositories/VisionRepository';
import { StarshipRepository } from '../repositories/StarshipRepository';
import { VisionFileService } from '../services/VisionFileService';

interface MigrationResult {
  totalFiles: number;
  successfulMigrations: number;
  failures: number;
  errors: Array<{
    starshipId: string;
    error: string;
  }>;
}

interface MigrationOptions {
  dryRun?: boolean;
}

/**
 * PHASE 3: Vision Files → Database Migration Script
 * 
 * Migrates existing vision content from file-based storage to database records
 * with direct starshipId relationships.
 */
class VisionFileMigration {
  private visionRepo: VisionRepository;
  private starshipRepo: StarshipRepository;
  private readonly VISION_DIR = path.join(process.cwd(), 'data', 'visions');
  private options: MigrationOptions;

  constructor(options: MigrationOptions = {}) {
    this.visionRepo = new VisionRepository();
    this.starshipRepo = new StarshipRepository();
    this.options = options;
  }

  /**
   * Main migration process
   */
  async run(): Promise<MigrationResult> {
    const result: MigrationResult = {
      totalFiles: 0,
      successfulMigrations: 0,
      failures: 0,
      errors: []
    };

    console.log('🚀 [VISION-MIGRATION] Starting vision files → database migration...');
    console.log(`📁 [VISION-MIGRATION] Scanning vision directory: ${this.VISION_DIR}`);

    try {
      // Initialize database connection only if not dry run
      if (!this.options.dryRun) {
        await this.initializeDatabase();
      } else {
        console.log('🔍 [VISION-MIGRATION] Running in DRY RUN mode - no database changes will be made');
      }

      // Scan for vision files
      const visionFiles = await this.scanVisionFiles();
      result.totalFiles = visionFiles.length;

      console.log(`📊 [VISION-MIGRATION] Found ${visionFiles.length} vision files to process`);

      if (visionFiles.length === 0) {
        console.log('✅ [VISION-MIGRATION] No vision files found - migration complete');
        return result;
      }

      // Process each vision file
      for (const filename of visionFiles) {
        const starshipId = this.extractStarshipIdFromFilename(filename);
        
        try {
          console.log(`🔄 [VISION-MIGRATION] Processing ${filename} (starship: ${starshipId})...`);
          
          const success = await this.migrateVisionFile(starshipId);
          
          if (success) {
            result.successfulMigrations++;
            console.log(`✅ [VISION-MIGRATION] Successfully migrated vision for starship ${starshipId}`);
          } else {
            result.failures++;
            result.errors.push({
              starshipId,
              error: 'Vision record already exists or migration failed'
            });
          }
        } catch (error) {
          result.failures++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({
            starshipId,
            error: errorMessage
          });
          console.error(`❌ [VISION-MIGRATION] Failed to migrate ${filename}:`, errorMessage);
        }
      }

      // Final report
      this.printMigrationReport(result);

    } catch (error) {
      console.error('💥 [VISION-MIGRATION] Critical migration error:', error);
      throw error;
    }

    return result;
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
    console.log('🔌 [VISION-MIGRATION] Initializing database connection...');
    
    const config = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password'
    };

    const connection = createConnection(config);
    await connection.connect();
    await connection.initializeSchema();
    
    console.log('✅ [VISION-MIGRATION] Database connection established');
  }

  /**
   * Scan for existing vision files
   */
  private async scanVisionFiles(): Promise<string[]> {
    try {
      await fs.ensureDir(this.VISION_DIR);
      const files = await fs.readdir(this.VISION_DIR);
      
      // Filter for .txt files with valid starship ID patterns
      const visionFiles = files.filter(file => {
        return file.endsWith('.txt') && this.isValidStarshipIdFormat(file);
      });

      return visionFiles;
    } catch (error) {
      console.error('❌ [VISION-MIGRATION] Failed to scan vision directory:', error);
      return [];
    }
  }

  /**
   * Extract starship ID from filename
   */
  private extractStarshipIdFromFilename(filename: string): string {
    return filename.replace('.txt', '');
  }

  /**
   * Validate starship ID format (basic validation)
   */
  private isValidStarshipIdFormat(filename: string): boolean {
    const starshipId = this.extractStarshipIdFromFilename(filename);
    // Basic validation - should be non-empty and reasonable length
    return starshipId.length > 0 && starshipId.length <= 200;
  }

  /**
   * Migrate a single vision file to database
   */
  private async migrateVisionFile(starshipId: string): Promise<boolean> {
    try {
      if (this.options.dryRun) {
        return await this.dryRunMigrateVisionFile(starshipId);
      }

      // 1. Check if starship exists
      const starship = await this.starshipRepo.findById(starshipId);
      if (!starship) {
        console.warn(`⚠️  [VISION-MIGRATION] Starship ${starshipId} not found - skipping migration`);
        return false;
      }

      // 2. Check if vision record already exists
      const existingVision = await this.visionRepo.findByStarship(starshipId);
      if (existingVision) {
        console.log(`📋 [VISION-MIGRATION] Vision already exists for starship ${starshipId} - skipping`);
        return false;
      }

      // 3. Read vision content from file
      const visionContent = await VisionFileService.readVision(starshipId);
      if (!visionContent || visionContent.trim().length === 0) {
        console.log(`📄 [VISION-MIGRATION] Empty vision file for starship ${starshipId} - creating empty record`);
        // Create empty vision record
        await this.visionRepo.create({
          starshipId,
          statement: '',
          confidence: 0.0,
          refinementCount: 0,
          lastRefined: new Date().toISOString(),
          isActive: true,
          _aggregateRoot: true
        });
        return true;
      }

      // 4. Create vision record with proper metadata
      const visionRecord = await this.visionRepo.create({
        starshipId,
        statement: visionContent,
        confidence: this.calculateInitialConfidence(visionContent),
        refinementCount: 0,
        lastRefined: new Date().toISOString(),
        isActive: true,
        _aggregateRoot: true
      });

      console.log(`💾 [VISION-MIGRATION] Created vision record:`, {
        id: visionRecord.id,
        starshipId: visionRecord.starshipId,
        statementLength: visionRecord.statement.length,
        confidence: visionRecord.confidence
      });

      return true;
    } catch (error) {
      console.error(`❌ [VISION-MIGRATION] Error migrating vision for starship ${starshipId}:`, error);
      return false;
    }
  }

  /**
   * Dry run migration - validate files and show what would be migrated
   */
  private async dryRunMigrateVisionFile(starshipId: string): Promise<boolean> {
    try {
      // 1. Read vision content from file
      const visionContent = await VisionFileService.readVision(starshipId);
      
      if (!visionContent || visionContent.trim().length === 0) {
        console.log(`📄 [DRY RUN] Would create empty vision record for starship ${starshipId}`);
        return true;
      }

      const confidence = this.calculateInitialConfidence(visionContent);
      
      console.log(`💾 [DRY RUN] Would create vision record:`, {
        starshipId,
        statementLength: visionContent.length,
        confidence,
        preview: visionContent.substring(0, 100) + (visionContent.length > 100 ? '...' : '')
      });

      return true;
    } catch (error) {
      console.error(`❌ [DRY RUN] Error processing vision for starship ${starshipId}:`, error);
      return false;
    }
  }

  /**
   * Calculate initial confidence based on vision content
   */
  private calculateInitialConfidence(content: string): number {
    if (!content || content.trim().length === 0) {
      return 0.0;
    }

    const length = content.trim().length;
    
    // Simple heuristic: longer, more detailed visions get higher confidence
    if (length < 50) return 0.3;
    if (length < 150) return 0.5;
    if (length < 300) return 0.7;
    if (length < 500) return 0.8;
    return 1.0; // Maximum confidence for comprehensive visions
  }

  /**
   * Print final migration report
   */
  private printMigrationReport(result: MigrationResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 [VISION-MIGRATION] MIGRATION REPORT');
    console.log('='.repeat(60));
    console.log(`📁 Total vision files found: ${result.totalFiles}`);
    console.log(`✅ Successful migrations: ${result.successfulMigrations}`);
    console.log(`❌ Failed migrations: ${result.failures}`);
    
    if (result.errors.length > 0) {
      console.log('\n🔍 [VISION-MIGRATION] Migration Errors:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. Starship ${error.starshipId}: ${error.error}`);
      });
    }

    const successRate = result.totalFiles > 0 ? 
      ((result.successfulMigrations / result.totalFiles) * 100).toFixed(1) : 
      '0.0';
    
    console.log(`\n📈 [VISION-MIGRATION] Success Rate: ${successRate}%`);
    
    if (result.successfulMigrations === result.totalFiles) {
      console.log('🎉 [VISION-MIGRATION] Migration completed successfully!');
    } else if (result.successfulMigrations > 0) {
      console.log('⚠️  [VISION-MIGRATION] Migration completed with some failures');
    } else {
      console.log('💥 [VISION-MIGRATION] Migration failed - no records migrated');
    }
    console.log('='.repeat(60));
  }
}

/**
 * Run migration if called directly
 */
async function runMigration() {
  // Check for dry run flag
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
  
  const migration = new VisionFileMigration({ dryRun: isDryRun });
  
  try {
    const result = await migration.run();
    
    // Exit with appropriate code
    if (result.failures === 0) {
      process.exit(0); // Success
    } else if (result.successfulMigrations > 0) {
      process.exit(1); // Partial success
    } else {
      process.exit(2); // Complete failure
    }
  } catch (error) {
    console.error('💥 [VISION-MIGRATION] Critical error:', error);
    process.exit(3); // Critical failure
  }
}

// Export for testing and direct execution
export { VisionFileMigration, MigrationResult, MigrationOptions };

// Run if called directly
if (require.main === module) {
  runMigration();
}