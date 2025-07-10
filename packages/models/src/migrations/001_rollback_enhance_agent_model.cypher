// Rollback script for enhanced agent model migration
// This removes all the enhanced fields added in 001_enhance_agent_model.cypher

MATCH (a:Agent)
REMOVE a.description, a.tags, a.category, a.authorId, a.isPublic,
       a.version, a.updatedAt, a.usageCount, a.rating, a.temperature,
       a.maxTokens, a.customInstructions, a.allowedStarshipClasses,
       a.requiredPermissions;

// Drop indexes
DROP INDEX agent_category_index IF EXISTS;
DROP INDEX agent_public_index IF EXISTS;
DROP INDEX agent_author_index IF EXISTS;
DROP INDEX agent_tags_index IF EXISTS;

// Drop full-text search index
CALL db.index.fulltext.drop('agentSearch');