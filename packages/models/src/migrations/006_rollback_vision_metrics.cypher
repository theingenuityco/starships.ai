// Migration 008 Rollback: Remove vision metrics properties
// This rollback removes the vision metrics properties added in migration 008

// Remove vision metrics properties from all Vision nodes
MATCH (v:Vision)
REMOVE 
    v.clarityScore,
    v.specificityScore,
    v.actionabilityScore,
    v.inspirationalScore,
    v.overallQuality,
    v.hasObjectives,
    v.hasTimeframe,
    v.hasMeasurables;

// Drop indexes created in migration 008
DROP INDEX vision_clarity_score_index IF EXISTS;
DROP INDEX vision_specificity_score_index IF EXISTS;
DROP INDEX vision_actionability_score_index IF EXISTS;
DROP INDEX vision_inspirational_score_index IF EXISTS;
DROP INDEX vision_overall_quality_index IF EXISTS;
DROP INDEX vision_starship_quality_index IF EXISTS;
DROP INDEX vision_starship_active_index IF EXISTS;
DROP INDEX vision_has_objectives_index IF EXISTS;
DROP INDEX vision_has_timeframe_index IF EXISTS;
DROP INDEX vision_has_measurables_index IF EXISTS;