// Migration: 006_expedition_seed_data.cypher
// Description: Comprehensive seed data for expedition orchestration system
// Date: 2025-01-21
// Author: System
// Dependencies: 005_comprehensive_expedition_schema

// ============================================================================
// SEED DATA CONFIGURATION
// ============================================================================

// Create seed data configuration node
CREATE (config:SeedDataConfig {
  id: 'expedition_seed_config',
  version: '1.0.0',
  environment: 'development',
  createdAt: datetime().epochMillis,
  description: 'Seed data configuration for expedition system',
  dataTypes: [
    'sample_expeditions',
    'sample_tasks',
    'sample_messages',
    'sample_results',
    'test_scenarios',
    'performance_test_data'
  ]
});

// ============================================================================
// SAMPLE EXPEDITIONS
// ============================================================================

// Find or create test starships for seed data
MERGE (testStarship1:Starship {id: 'starship-seed-001'})
ON CREATE SET 
  testStarship1.slug = 'test-explorer',
  testStarship1.ownerId = 'user-seed-001',
  testStarship1.class = 'scout',
  testStarship1.name = 'Test Explorer',
  testStarship1.maxActiveExpeditions = 2,
  testStarship1.maxAgents = 3,
  testStarship1.status = 'active',
  testStarship1.createdAt = datetime().epochMillis,
  testStarship1.updatedAt = datetime().epochMillis;

MERGE (testStarship2:Starship {id: 'starship-seed-002'})
ON CREATE SET 
  testStarship2.slug = 'test-voyager',
  testStarship2.ownerId = 'user-seed-002',
  testStarship2.class = 'cruiser',
  testStarship2.name = 'Test Voyager',
  testStarship2.maxActiveExpeditions = 5,
  testStarship2.maxAgents = 6,
  testStarship2.status = 'active',
  testStarship2.createdAt = datetime().epochMillis,
  testStarship2.updatedAt = datetime().epochMillis;

// Create sample users
MERGE (testUser1:User {id: 'user-seed-001'})
ON CREATE SET 
  testUser1.username = 'test_captain_1',
  testUser1.email = 'captain1@starships.test',
  testUser1.displayName = 'Captain Test One',
  testUser1.createdAt = datetime().epochMillis;

MERGE (testUser2:User {id: 'user-seed-002'})
ON CREATE SET 
  testUser2.username = 'test_captain_2',
  testUser2.email = 'captain2@starships.test',
  testUser2.displayName = 'Captain Test Two',
  testUser2.createdAt = datetime().epochMillis;

// Create ownership relationships
MERGE (testUser1)-[:OWNS {ownedSince: datetime().epochMillis}]->(testStarship1);
MERGE (testUser2)-[:OWNS {ownedSince: datetime().epochMillis}]->(testStarship2);

// Create sample agents
MERGE (testAgent1:Agent {id: 'agent-seed-001'})
ON CREATE SET 
  testAgent1.name = 'Research Assistant Alpha',
  testAgent1.model = 'gpt-4',
  testAgent1.category = 'analysis',
  testAgent1.tags = ['research', 'analysis', 'data'],
  testAgent1.systemPrompt = 'You are a research assistant specialized in data analysis and research tasks.',
  testAgent1.authorId = 'user-seed-001',
  testAgent1.isPublic = true,
  testAgent1.version = '1.0.0',
  testAgent1.createdAt = datetime().epochMillis,
  testAgent1.updatedAt = datetime().epochMillis,
  testAgent1.usageCount = 0,
  testAgent1.temperature = 0.7,
  testAgent1.maxTokens = 4000;

MERGE (testAgent2:Agent {id: 'agent-seed-002'})
ON CREATE SET 
  testAgent2.name = 'Code Generator Beta',
  testAgent2.model = 'gpt-4',
  testAgent2.category = 'coding',
  testAgent2.tags = ['coding', 'development', 'programming'],
  testAgent2.systemPrompt = 'You are a coding assistant specialized in software development and programming tasks.',
  testAgent2.authorId = 'user-seed-001',
  testAgent2.isPublic = true,
  testAgent2.version = '1.0.0',
  testAgent2.createdAt = datetime().epochMillis,
  testAgent2.updatedAt = datetime().epochMillis,
  testAgent2.usageCount = 0,
  testAgent2.temperature = 0.3,
  testAgent2.maxTokens = 4000;

MERGE (testAgent3:Agent {id: 'agent-seed-003'})
ON CREATE SET 
  testAgent3.name = 'Creative Writer Gamma',
  testAgent3.model = 'gpt-4',
  testAgent3.category = 'creative',
  testAgent3.tags = ['writing', 'creative', 'content'],
  testAgent3.systemPrompt = 'You are a creative writing assistant specialized in content creation and storytelling.',
  testAgent3.authorId = 'user-seed-002',
  testAgent3.isPublic = true,
  testAgent3.version = '1.0.0',
  testAgent3.createdAt = datetime().epochMillis,
  testAgent3.updatedAt = datetime().epochMillis,
  testAgent3.usageCount = 0,
  testAgent3.temperature = 0.9,
  testAgent3.maxTokens = 4000;

// Deploy agents to starships
MERGE (testAgent1)-[:DEPLOYED_ON {deployedAt: datetime().epochMillis, isActive: true}]->(testStarship1);
MERGE (testAgent2)-[:DEPLOYED_ON {deployedAt: datetime().epochMillis, isActive: true}]->(testStarship1);
MERGE (testAgent3)-[:DEPLOYED_ON {deployedAt: datetime().epochMillis, isActive: true}]->(testStarship2);

// Create sample expeditions with different statuses
CREATE (expedition1:Expedition {
  id: 'expedition-seed-001',
  starshipId: 'starship-seed-001',
  title: 'Market Research Analysis',
  description: 'Comprehensive analysis of current market trends and opportunities in the AI space',
  objective: 'Provide actionable insights for strategic decision making',
  status: 'completed',
  priority: 'high',
  assignedAgents: ['agent-seed-001', 'agent-seed-002'],
  tags: ['research', 'market-analysis', 'ai'],
  createdAt: datetime({epochMillis: datetime().epochMillis - 86400000}).epochMillis, // 1 day ago
  updatedAt: datetime({epochMillis: datetime().epochMillis - 3600000}).epochMillis, // 1 hour ago
  createdBy: 'user-seed-001',
  estimatedDuration: 480, // 8 hours
  actualDuration: 420, // 7 hours
  result: 'Comprehensive market analysis report with 15 key insights and 8 strategic recommendations'
});

CREATE (expedition2:Expedition {
  id: 'expedition-seed-002',
  starshipId: 'starship-seed-001',
  title: 'Product Feature Development',
  description: 'Design and implement new user authentication system with advanced security features',
  objective: 'Enhance platform security and user experience',
  status: 'in-progress',
  priority: 'urgent',
  assignedAgents: ['agent-seed-002'],
  tags: ['development', 'security', 'authentication'],
  createdAt: datetime({epochMillis: datetime().epochMillis - 43200000}).epochMillis, // 12 hours ago
  updatedAt: datetime({epochMillis: datetime().epochMillis - 1800000}).epochMillis, // 30 minutes ago
  createdBy: 'user-seed-001',
  estimatedDuration: 960, // 16 hours
  workflowState: {
    currentPhase: 'coordinating',
    requirements: 'Multi-factor authentication, OAuth integration, session management',
    taskBreakdown: [],
    agentAssignments: {`agent-seed-002`: ['auth-design', 'implementation']},
    agentResults: {},
    userId: 'user-seed-001',
    starshipId: 'starship-seed-001',
    retryCount: 0,
    lastUpdated: datetime({epochMillis: datetime().epochMillis - 1800000}).epochMillis
  }
});

CREATE (expedition3:Expedition {
  id: 'expedition-seed-003',
  starshipId: 'starship-seed-002',
  title: 'Content Strategy Campaign',
  description: 'Develop comprehensive content strategy for Q2 marketing campaign',
  objective: 'Increase brand awareness and engagement by 40%',
  status: 'planning',
  priority: 'medium',
  assignedAgents: ['agent-seed-003'],
  tags: ['marketing', 'content', 'strategy'],
  createdAt: datetime({epochMillis: datetime().epochMillis - 21600000}).epochMillis, // 6 hours ago
  updatedAt: datetime({epochMillis: datetime().epochMillis - 900000}).epochMillis, // 15 minutes ago
  createdBy: 'user-seed-002',
  estimatedDuration: 720 // 12 hours
});

CREATE (expedition4:Expedition {
  id: 'expedition-seed-004',
  starshipId: 'starship-seed-002',
  title: 'Failed Test Expedition',
  description: 'This expedition was created to test failure scenarios and error handling',
  objective: 'Test system resilience and error recovery',
  status: 'failed',
  priority: 'low',
  assignedAgents: [],
  tags: ['test', 'failure', 'error-handling'],
  createdAt: datetime({epochMillis: datetime().epochMillis - 172800000}).epochMillis, // 2 days ago
  updatedAt: datetime({epochMillis: datetime().epochMillis - 86400000}).epochMillis, // 1 day ago
  createdBy: 'user-seed-002',
  estimatedDuration: 240, // 4 hours
  result: 'Expedition failed due to insufficient agent availability and resource constraints'
});

// Create expedition relationships
MATCH (s1:Starship {id: 'starship-seed-001'}), (e1:Expedition {id: 'expedition-seed-001'})
CREATE (s1)-[:HAS_EXPEDITION {createdAt: e1.createdAt}]->(e1);

MATCH (s1:Starship {id: 'starship-seed-001'}), (e2:Expedition {id: 'expedition-seed-002'})
CREATE (s1)-[:HAS_EXPEDITION {createdAt: e2.createdAt}]->(e2);

MATCH (s2:Starship {id: 'starship-seed-002'}), (e3:Expedition {id: 'expedition-seed-003'})
CREATE (s2)-[:HAS_EXPEDITION {createdAt: e3.createdAt}]->(e3);

MATCH (s2:Starship {id: 'starship-seed-002'}), (e4:Expedition {id: 'expedition-seed-004'})
CREATE (s2)-[:HAS_EXPEDITION {createdAt: e4.createdAt}]->(e4);

// Create agent assignments
MATCH (a1:Agent {id: 'agent-seed-001'}), (e1:Expedition {id: 'expedition-seed-001'})
CREATE (a1)-[:ASSIGNED_TO {assignedAt: e1.createdAt, role: 'researcher'}]->(e1);

MATCH (a2:Agent {id: 'agent-seed-002'}), (e1:Expedition {id: 'expedition-seed-001'})
CREATE (a2)-[:ASSIGNED_TO {assignedAt: e1.createdAt, role: 'developer'}]->(e1);

MATCH (a2:Agent {id: 'agent-seed-002'}), (e2:Expedition {id: 'expedition-seed-002'})
CREATE (a2)-[:ASSIGNED_TO {assignedAt: e2.createdAt, role: 'lead_developer'}]->(e2);

MATCH (a3:Agent {id: 'agent-seed-003'}), (e3:Expedition {id: 'expedition-seed-003'})
CREATE (a3)-[:ASSIGNED_TO {assignedAt: e3.createdAt, role: 'content_strategist'}]->(e3);

// ============================================================================
// SAMPLE TASKS
// ============================================================================

// Tasks for completed expedition
CREATE (task1:ExpeditionTask {
  id: 'task-seed-001',
  expeditionId: 'expedition-seed-001',
  title: 'Market Size Analysis',
  description: 'Analyze total addressable market and market segments',
  requiredSkills: ['research', 'analysis', 'data-processing'],
  assignedAgentId: 'agent-seed-001',
  status: 'completed',
  priority: 'high',
  dependencies: [],
  deliverable: 'Market size report with TAM, SAM, and SOM calculations',
  result: 'TAM: $50B, SAM: $5B, SOM: $500M with detailed breakdown by segments',
  estimatedEffort: 240, // 4 hours
  actualEffort: 210, // 3.5 hours
  createdAt: datetime({epochMillis: datetime().epochMillis - 86400000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 82800000}).epochMillis
});

CREATE (task2:ExpeditionTask {
  id: 'task-seed-002',
  expeditionId: 'expedition-seed-001',
  title: 'Competitor Analysis',
  description: 'Analyze top 10 competitors and their market positioning',
  requiredSkills: ['research', 'competitive-analysis'],
  assignedAgentId: 'agent-seed-001',
  status: 'completed',
  priority: 'high',
  dependencies: ['task-seed-001'],
  deliverable: 'Competitor analysis matrix with SWOT analysis',
  result: 'Comprehensive competitor analysis with positioning map and strategic recommendations',
  estimatedEffort: 180, // 3 hours
  actualEffort: 165, // 2.75 hours
  createdAt: datetime({epochMillis: datetime().epochMillis - 82800000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 79200000}).epochMillis
});

CREATE (task3:ExpeditionTask {
  id: 'task-seed-003',
  expeditionId: 'expedition-seed-001',
  title: 'Strategic Recommendations',
  description: 'Synthesize research findings into actionable strategic recommendations',
  requiredSkills: ['strategy', 'synthesis', 'business-analysis'],
  assignedAgentId: 'agent-seed-002',
  status: 'completed',
  priority: 'critical',
  dependencies: ['task-seed-001', 'task-seed-002'],
  deliverable: 'Strategic recommendations document with implementation roadmap',
  result: '8 strategic recommendations with priority matrix and implementation timeline',
  estimatedEffort: 120, // 2 hours
  actualEffort: 105, // 1.75 hours
  createdAt: datetime({epochMillis: datetime().epochMillis - 79200000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 75600000}).epochMillis
});

// Tasks for in-progress expedition
CREATE (task4:ExpeditionTask {
  id: 'task-seed-004',
  expeditionId: 'expedition-seed-002',
  title: 'Authentication System Design',
  description: 'Design comprehensive authentication system architecture',
  requiredSkills: ['system-design', 'security', 'architecture'],
  assignedAgentId: 'agent-seed-002',
  status: 'completed',
  priority: 'urgent',
  dependencies: [],
  deliverable: 'System architecture diagram and technical specifications',
  result: 'Complete system design with OAuth 2.0, JWT tokens, and MFA integration',
  estimatedEffort: 360, // 6 hours
  actualEffort: 330, // 5.5 hours
  createdAt: datetime({epochMillis: datetime().epochMillis - 43200000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 28800000}).epochMillis
});

CREATE (task5:ExpeditionTask {
  id: 'task-seed-005',
  expeditionId: 'expedition-seed-002',
  title: 'Backend Implementation',
  description: 'Implement authentication backend services and APIs',
  requiredSkills: ['backend-development', 'api-design', 'security'],
  assignedAgentId: 'agent-seed-002',
  status: 'in-progress',
  priority: 'urgent',
  dependencies: ['task-seed-004'],
  deliverable: 'Working authentication API with comprehensive test suite',
  estimatedEffort: 480, // 8 hours
  createdAt: datetime({epochMillis: datetime().epochMillis - 28800000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 1800000}).epochMillis
});

CREATE (task6:ExpeditionTask {
  id: 'task-seed-006',
  expeditionId: 'expedition-seed-002',
  title: 'Frontend Integration',
  description: 'Integrate authentication system with frontend application',
  requiredSkills: ['frontend-development', 'integration', 'ui-ux'],
  status: 'pending',
  priority: 'high',
  dependencies: ['task-seed-005'],
  deliverable: 'Integrated authentication UI with user flows',
  estimatedEffort: 240, // 4 hours
  createdAt: datetime({epochMillis: datetime().epochMillis - 21600000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 21600000}).epochMillis
});

// Tasks for planning expedition
CREATE (task7:ExpeditionTask {
  id: 'task-seed-007',
  expeditionId: 'expedition-seed-003',
  title: 'Content Audit',
  description: 'Audit existing content and identify gaps',
  requiredSkills: ['content-analysis', 'audit', 'strategy'],
  assignedAgentId: 'agent-seed-003',
  status: 'assigned',
  priority: 'medium',
  dependencies: [],
  deliverable: 'Content audit report with gap analysis',
  estimatedEffort: 180, // 3 hours
  createdAt: datetime({epochMillis: datetime().epochMillis - 21600000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 900000}).epochMillis
});

// Create task relationships
MATCH (e1:Expedition {id: 'expedition-seed-001'}), (t1:ExpeditionTask {id: 'task-seed-001'})
CREATE (e1)-[:HAS_TASK {createdAt: t1.createdAt}]->(t1);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (t2:ExpeditionTask {id: 'task-seed-002'})
CREATE (e1)-[:HAS_TASK {createdAt: t2.createdAt}]->(t2);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (t3:ExpeditionTask {id: 'task-seed-003'})
CREATE (e1)-[:HAS_TASK {createdAt: t3.createdAt}]->(t3);

MATCH (e2:Expedition {id: 'expedition-seed-002'}), (t4:ExpeditionTask {id: 'task-seed-004'})
CREATE (e2)-[:HAS_TASK {createdAt: t4.createdAt}]->(t4);

MATCH (e2:Expedition {id: 'expedition-seed-002'}), (t5:ExpeditionTask {id: 'task-seed-005'})
CREATE (e2)-[:HAS_TASK {createdAt: t5.createdAt}]->(t5);

MATCH (e2:Expedition {id: 'expedition-seed-002'}), (t6:ExpeditionTask {id: 'task-seed-006'})
CREATE (e2)-[:HAS_TASK {createdAt: t6.createdAt}]->(t6);

MATCH (e3:Expedition {id: 'expedition-seed-003'}), (t7:ExpeditionTask {id: 'task-seed-007'})
CREATE (e3)-[:HAS_TASK {createdAt: t7.createdAt}]->(t7);

// Create task dependencies
MATCH (t2:ExpeditionTask {id: 'task-seed-002'}), (t1:ExpeditionTask {id: 'task-seed-001'})
CREATE (t2)-[:DEPENDS_ON {createdAt: t2.createdAt}]->(t1);

MATCH (t3:ExpeditionTask {id: 'task-seed-003'}), (t1:ExpeditionTask {id: 'task-seed-001'})
CREATE (t3)-[:DEPENDS_ON {createdAt: t3.createdAt}]->(t1);

MATCH (t3:ExpeditionTask {id: 'task-seed-003'}), (t2:ExpeditionTask {id: 'task-seed-002'})
CREATE (t3)-[:DEPENDS_ON {createdAt: t3.createdAt}]->(t2);

MATCH (t5:ExpeditionTask {id: 'task-seed-005'}), (t4:ExpeditionTask {id: 'task-seed-004'})
CREATE (t5)-[:DEPENDS_ON {createdAt: t5.createdAt}]->(t4);

MATCH (t6:ExpeditionTask {id: 'task-seed-006'}), (t5:ExpeditionTask {id: 'task-seed-005'})
CREATE (t6)-[:DEPENDS_ON {createdAt: t6.createdAt}]->(t5);

// Create agent task assignments
MATCH (a1:Agent {id: 'agent-seed-001'}), (t1:ExpeditionTask {id: 'task-seed-001'})
CREATE (a1)-[:ASSIGNED_TO {assignedAt: t1.createdAt}]->(t1);

MATCH (a1:Agent {id: 'agent-seed-001'}), (t2:ExpeditionTask {id: 'task-seed-002'})
CREATE (a1)-[:ASSIGNED_TO {assignedAt: t2.createdAt}]->(t2);

MATCH (a2:Agent {id: 'agent-seed-002'}), (t3:ExpeditionTask {id: 'task-seed-003'})
CREATE (a2)-[:ASSIGNED_TO {assignedAt: t3.createdAt}]->(t3);

MATCH (a2:Agent {id: 'agent-seed-002'}), (t4:ExpeditionTask {id: 'task-seed-004'})
CREATE (a2)-[:ASSIGNED_TO {assignedAt: t4.createdAt}]->(t4);

MATCH (a2:Agent {id: 'agent-seed-002'}), (t5:ExpeditionTask {id: 'task-seed-005'})
CREATE (a2)-[:ASSIGNED_TO {assignedAt: t5.createdAt}]->(t5);

MATCH (a3:Agent {id: 'agent-seed-003'}), (t7:ExpeditionTask {id: 'task-seed-007'})
CREATE (a3)-[:ASSIGNED_TO {assignedAt: t7.createdAt}]->(t7);

// Log seed data completion
CREATE (m:Migration {
  id: '006_expedition_seed_data',
  name: 'Expedition System Seed Data',
  description: 'Comprehensive seed data for expedition orchestration system development and testing',
  version: '1.0.0',
  dependencies: ['005_comprehensive_expedition_schema'],
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  seedDataStats: {
    starships: 2,
    users: 2,
    agents: 3,
    expeditions: 4,
    tasks: 7,
    relationships: 25
  }
})
RETURN m.id as migrationId, m.appliedAt as appliedAt, m.seedDataStats as stats;