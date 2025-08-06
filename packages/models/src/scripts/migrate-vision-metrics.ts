#!/usr/bin/env tsx

/**
 * Migration script to backfill vision metrics for existing Vision nodes
 * 
 * This script:
 * 1. Fetches all existing Vision nodes that don't have metrics calculated
 * 2. Calculates metrics using the VisionMetricsCalculator
 * 3. Updates the Vision nodes with calculated metrics
 */

import { getConnection } from '../connection';
import { Vision } from '../types';

// Import the VisionMetricsCalculator - this will need to be available in models package
// We'll create a simple calculator here since the main one is in server package
interface VisionMetrics {
  clarityScore: number;
  specificityScore: number;
  actionabilityScore: number;
  inspirationalScore: number;
  overallQuality: number;
  hasObjectives: boolean;
  hasTimeframe: boolean;
  hasMeasurables: boolean;
}

class SimplifiedVisionMetricsCalculator {
  calculateMetrics(vision: string): VisionMetrics {
    const lowerVision = vision.toLowerCase();
    
    // Simple clarity score based on length and readability
    const words = vision.split(/\s+/).filter(w => w.length > 0);
    const sentences = vision.split(/[.!?]/).filter(s => s.trim()).length;
    const avgWordsPerSentence = sentences > 0 ? words.length / sentences : words.length;
    
    let clarityScore = 60;
    if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 20) clarityScore += 20;
    if (words.length >= 20 && words.length <= 150) clarityScore += 10;
    
    // Simple specificity score based on specific terms
    const specificTerms = /\d+|specific|particular|exact|precise|detailed/gi;
    const specificMatches = (vision.match(specificTerms) || []).length;
    const specificityScore = Math.min(90, 40 + specificMatches * 8);
    
    // Simple actionability score based on action verbs
    const actionVerbs = /will|create|build|develop|achieve|deliver|implement|establish|execute|produce/gi;
    const actionMatches = (vision.match(actionVerbs) || []).length;
    const actionabilityScore = Math.min(90, 35 + actionMatches * 10);
    
    // Simple inspirational score based on positive/future language
    const inspirationalTerms = /transform|innovate|excel|outstanding|future|better|improve|enhance|leading|success/gi;
    const inspirationalMatches = (vision.match(inspirationalTerms) || []).length;
    const inspirationalScore = Math.min(90, 45 + inspirationalMatches * 8);
    
    // Overall quality as weighted average
    const overallQuality = Math.round(
      clarityScore * 0.25 + 
      specificityScore * 0.30 + 
      actionabilityScore * 0.30 + 
      inspirationalScore * 0.15
    );
    
    // Detect completeness elements
    const hasObjectives = /will\s+\w+|goal|objective|target|aim to|achieve|accomplish/i.test(vision);
    const hasTimeframe = /\d{4}|by\s+(january|february|march|april|may|june|july|august|september|october|november|december)|within\s+\d+\s+(days|weeks|months|years)|next\s+(quarter|year)/i.test(vision);
    const hasMeasurables = /\d+%|\$\d+|\d+\s*(users|customers|products|clients|members)|increase.*by.*\d+|market share/i.test(vision);
    
    return {
      clarityScore: Math.max(0, Math.min(100, clarityScore)),
      specificityScore: Math.max(0, Math.min(100, specificityScore)),
      actionabilityScore: Math.max(0, Math.min(100, actionabilityScore)),
      inspirationalScore: Math.max(0, Math.min(100, inspirationalScore)),
      overallQuality: Math.max(0, Math.min(100, overallQuality)),
      hasObjectives,
      hasTimeframe,
      hasMeasurables
    };
  }
}

async function migrateVisionMetrics() {
  console.log('🚀 Starting vision metrics migration...');
  
  try {
    const connection = getConnection();
    const calculator = new SimplifiedVisionMetricsCalculator();
    
    // Find all visions that don't have metrics calculated yet
    console.log('📋 Finding visions without metrics...');
    const visionsResult = await connection.executeQuery<{ v: Vision }>(
      `MATCH (v:Vision) 
       WHERE v.overallQuality IS NULL 
       RETURN v 
       ORDER BY v.createdAt DESC`
    );
    
    const visions = visionsResult.map(record => record.v);
    console.log(`📊 Found ${visions.length} visions to process`);
    
    if (visions.length === 0) {
      console.log('✅ No visions need metrics calculation');
      return;
    }
    
    let processed = 0;
    let errors = 0;
    
    // Process each vision
    for (const vision of visions) {
      try {
        console.log(`🔄 Processing vision ${vision.id} (${processed + 1}/${visions.length})`);
        
        if (!vision.statement || vision.statement.trim().length === 0) {
          console.log(`⚠️  Skipping vision ${vision.id} - empty statement`);
          continue;
        }
        
        // Calculate metrics
        const metrics = calculator.calculateMetrics(vision.statement);
        
        // Update the vision with calculated metrics
        await connection.executeWrite(
          `MATCH (v:Vision) WHERE v.id = $id 
           SET v.clarityScore = $clarityScore,
               v.specificityScore = $specificityScore,
               v.actionabilityScore = $actionabilityScore,
               v.inspirationalScore = $inspirationalScore,
               v.overallQuality = $overallQuality,
               v.hasObjectives = $hasObjectives,
               v.hasTimeframe = $hasTimeframe,
               v.hasMeasurables = $hasMeasurables,
               v.updatedAt = $timestamp`,
          {
            id: vision.id,
            clarityScore: metrics.clarityScore,
            specificityScore: metrics.specificityScore,
            actionabilityScore: metrics.actionabilityScore,
            inspirationalScore: metrics.inspirationalScore,
            overallQuality: metrics.overallQuality,
            hasObjectives: metrics.hasObjectives,
            hasTimeframe: metrics.hasTimeframe,
            hasMeasurables: metrics.hasMeasurables,
            timestamp: new Date().toISOString()
          }
        );
        
        processed++;
        console.log(`✅ Updated vision ${vision.id} (Overall Quality: ${metrics.overallQuality})`);
        
        // Add a small delay to avoid overwhelming the database
        if (processed % 10 === 0) {
          console.log(`💤 Taking a short break... (${processed}/${visions.length} processed)`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        errors++;
        console.error(`❌ Error processing vision ${vision.id}:`, error);
      }
    }
    
    console.log(`\n📈 Migration Summary:`);
    console.log(`   Total visions: ${visions.length}`);
    console.log(`   Successfully processed: ${processed}`);
    console.log(`   Errors: ${errors}`);
    
    if (errors === 0) {
      console.log('🎉 Vision metrics migration completed successfully!');
    } else {
      console.log(`⚠️  Vision metrics migration completed with ${errors} errors`);
    }
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateVisionMetrics()
    .then(() => {
      console.log('🏁 Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateVisionMetrics };