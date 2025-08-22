// Migration 008: Add vision metrics properties
// This migration adds new properties to Vision nodes for enhanced metrics and quality analysis

// Add vision metrics properties to all existing Vision nodes
MATCH (v:Vision)
SET 
    v.clarityScore = null,
    v.specificityScore = null,
    v.actionabilityScore = null,
    v.inspirationalScore = null,
    v.overallQuality = null,
    v.hasObjectives = null,
    v.hasTimeframe = null,
    v.hasMeasurables = null;

// Create indexes for efficient querying of metrics
CREATE INDEX vision_clarity_score_index IF NOT EXISTS FOR (v:Vision) ON (v.clarityScore);
CREATE INDEX vision_specificity_score_index IF NOT EXISTS FOR (v:Vision) ON (v.specificityScore);
CREATE INDEX vision_actionability_score_index IF NOT EXISTS FOR (v:Vision) ON (v.actionabilityScore);
CREATE INDEX vision_inspirational_score_index IF NOT EXISTS FOR (v:Vision) ON (v.inspirationalScore);
CREATE INDEX vision_overall_quality_index IF NOT EXISTS FOR (v:Vision) ON (v.overallQuality);

// Create composite indexes for efficient filtering
CREATE INDEX vision_starship_quality_index IF NOT EXISTS FOR (v:Vision) ON (v.starshipId, v.overallQuality);
CREATE INDEX vision_starship_active_index IF NOT EXISTS FOR (v:Vision) ON (v.starshipId, v.isActive);

// Create indexes for completeness checks
CREATE INDEX vision_has_objectives_index IF NOT EXISTS FOR (v:Vision) ON (v.hasObjectives);
CREATE INDEX vision_has_timeframe_index IF NOT EXISTS FOR (v:Vision) ON (v.hasTimeframe);
CREATE INDEX vision_has_measurables_index IF NOT EXISTS FOR (v:Vision) ON (v.hasMeasurables);