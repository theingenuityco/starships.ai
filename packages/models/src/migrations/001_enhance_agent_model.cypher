// Add new properties to existing Agent nodes with default values
MATCH (a:Agent)
SET
  a.description = COALESCE(a.description, null),
  a.tags = COALESCE(a.tags, []),
  a.category = COALESCE(a.category, 'general'),
  a.authorId = COALESCE(a.authorId, 'system'),
  a.isPublic = COALESCE(a.isPublic, false),
  a.version = COALESCE(a.version, '1.0.0'),
  a.updatedAt = COALESCE(a.updatedAt, a.createdAt),
  a.usageCount = COALESCE(a.usageCount, 0),
  a.temperature = COALESCE(a.temperature, null),
  a.maxTokens = COALESCE(a.maxTokens, null),
  a.customInstructions = COALESCE(a.customInstructions, null),
  a.allowedStarshipClasses = COALESCE(a.allowedStarshipClasses, ['scout', 'cruiser']),
  a.requiredPermissions = COALESCE(a.requiredPermissions, []);

// Create indexes for enhanced querying
CREATE INDEX agent_category_index IF NOT EXISTS FOR (a:Agent) ON (a.category);
CREATE INDEX agent_public_index IF NOT EXISTS FOR (a:Agent) ON (a.isPublic);
CREATE INDEX agent_author_index IF NOT EXISTS FOR (a:Agent) ON (a.authorId);
CREATE INDEX agent_tags_index IF NOT EXISTS FOR (a:Agent) ON (a.tags);

// Create full-text search index
CALL db.index.fulltext.createNodeIndex('agentSearch', ['Agent'], ['name', 'description', 'systemPrompt', 'tags']);