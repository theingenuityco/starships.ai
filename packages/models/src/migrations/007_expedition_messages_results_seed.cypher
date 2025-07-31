// Migration: 007_expedition_messages_results_seed.cypher
// Description: Seed data for expedition messages and results
// Date: 2025-01-21
// Author: System
// Dependencies: 006_expedition_seed_data

// ============================================================================
// SAMPLE EXPEDITION MESSAGES
// ============================================================================

// Messages for completed expedition (expedition-seed-001)
CREATE (msg1:ExpeditionMessage {
  id: 'message-seed-001',
  expeditionId: 'expedition-seed-001',
  role: 'user',
  userId: 'user-seed-001',
  content: 'Starting market research analysis expedition. Please analyze the AI market landscape and provide comprehensive insights.',
  messageType: 'user-input',
  timestamp: datetime({epochMillis: datetime().epochMillis - 86400000}).epochMillis, // 1 day ago
  metadata: {
    priority: 'high',
    expectedDeliverables: ['market-size', 'competitor-analysis', 'recommendations']
  }
});

CREATE (msg2:ExpeditionMessage {
  id: 'message-seed-002',
  expeditionId: 'expedition-seed-001',
  role: 'first-officer',
  content: 'Expedition initiated. Breaking down requirements into tasks: 1) Market Size Analysis, 2) Competitor Analysis, 3) Strategic Recommendations. Assigning Research Assistant Alpha and Code Generator Beta.',
  messageType: 'coordination',
  timestamp: datetime({epochMillis: datetime().epochMillis - 86395000}).epochMillis,
  metadata: {
    taskBreakdown: ['market-size', 'competitor-analysis', 'recommendations'],
    agentAssignments: ['agent-seed-001', 'agent-seed-002']
  }
});

CREATE (msg3:ExpeditionMessage {
  id: 'message-seed-003',
  expeditionId: 'expedition-seed-001',
  role: 'agent',
  agentId: 'agent-seed-001',
  content: 'Beginning market size analysis. Researching total addressable market (TAM), serviceable addressable market (SAM), and serviceable obtainable market (SOM) for AI industry.',
  messageType: 'task-work',
  timestamp: datetime({epochMillis: datetime().epochMillis - 86390000}).epochMillis,
  metadata: {
    taskId: 'task-seed-001',
    workPhase: 'research'
  }
});

CREATE (msg4:ExpeditionMessage {
  id: 'message-seed-004',
  expeditionId: 'expedition-seed-001',
  role: 'agent',
  agentId: 'agent-seed-001',
  content: 'Market size analysis complete. TAM: $50B, SAM: $5B, SOM: $500M. Key growth drivers identified: enterprise adoption, automation demand, and regulatory compliance needs.',
  messageType: 'result',
  timestamp: datetime({epochMillis: datetime().epochMillis - 82800000}).epochMillis,
  metadata: {
    taskId: 'task-seed-001',
    deliverable: 'market-size-report',
    confidence: 0.92
  }
});

CREATE (msg5:ExpeditionMessage {
  id: 'message-seed-005',
  expeditionId: 'expedition-seed-001',
  role: 'agent',
  agentId: 'agent-seed-001',
  content: 'Starting competitor analysis. Analyzing top 10 competitors: OpenAI, Google, Microsoft, Amazon, IBM, Anthropic, Cohere, Stability AI, Hugging Face, and DataRobot.',
  messageType: 'task-work',
  timestamp: datetime({epochMillis: datetime().epochMillis - 82795000}).epochMillis,
  metadata: {
    taskId: 'task-seed-002',
    competitors: ['OpenAI', 'Google', 'Microsoft', 'Amazon', 'IBM']
  }
});

CREATE (msg6:ExpeditionMessage {
  id: 'message-seed-006',
  expeditionId: 'expedition-seed-001',
  role: 'agent',
  agentId: 'agent-seed-001',
  content: 'Competitor analysis complete. Identified key differentiators and market positioning opportunities. OpenAI leads in general AI, Google dominates enterprise, Microsoft excels in integration.',
  messageType: 'result',
  timestamp: datetime({epochMillis: datetime().epochMillis - 79200000}).epochMillis,
  metadata: {
    taskId: 'task-seed-002',
    deliverable: 'competitor-analysis',
    keyInsights: ['market-leaders', 'positioning-gaps', 'opportunities']
  }
});

CREATE (msg7:ExpeditionMessage {
  id: 'message-seed-007',
  expeditionId: 'expedition-seed-001',
  role: 'agent',
  agentId: 'agent-seed-002',
  content: 'Synthesizing research findings into strategic recommendations. Focusing on market entry strategies, competitive positioning, and growth opportunities.',
  messageType: 'task-work',
  timestamp: datetime({epochMillis: datetime().epochMillis - 79195000}).epochMillis,
  metadata: {
    taskId: 'task-seed-003',
    inputSources: ['market-analysis', 'competitor-analysis']
  }
});

CREATE (msg8:ExpeditionMessage {
  id: 'message-seed-008',
  expeditionId: 'expedition-seed-001',
  role: 'agent',
  agentId: 'agent-seed-002',
  content: 'Strategic recommendations complete. 8 key recommendations identified with implementation roadmap. Priority focus on enterprise partnerships and vertical specialization.',
  messageType: 'result',
  timestamp: datetime({epochMillis: datetime().epochMillis - 75600000}).epochMillis,
  metadata: {
    taskId: 'task-seed-003',
    deliverable: 'strategic-recommendations',
    recommendationCount: 8
  }
});

CREATE (msg9:ExpeditionMessage {
  id: 'message-seed-009',
  expeditionId: 'expedition-seed-001',
  role: 'first-officer',
  content: 'Expedition completed successfully. All tasks finished ahead of schedule. Final report compiled with market analysis, competitor insights, and strategic recommendations.',
  messageType: 'status-update',
  timestamp: datetime({epochMillis: datetime().epochMillis - 75595000}).epochMillis,
  metadata: {
    expeditionStatus: 'completed',
    completionRate: 1.0,
    timeEfficiency: 1.14
  }
});

// Messages for in-progress expedition (expedition-seed-002)
CREATE (msg10:ExpeditionMessage {
  id: 'message-seed-010',
  expeditionId: 'expedition-seed-002',
  role: 'user',
  userId: 'user-seed-001',
  content: 'Need to implement a secure authentication system with multi-factor authentication and OAuth integration. This is urgent for our security compliance.',
  messageType: 'user-input',
  timestamp: datetime({epochMillis: datetime().epochMillis - 43200000}).epochMillis,
  metadata: {
    priority: 'urgent',
    requirements: ['MFA', 'OAuth', 'security-compliance']
  }
});

CREATE (msg11:ExpeditionMessage {
  id: 'message-seed-011',
  expeditionId: 'expedition-seed-002',
  role: 'first-officer',
  content: 'Authentication system expedition initiated. Breaking down into: 1) System Design, 2) Backend Implementation, 3) Frontend Integration. Assigning Code Generator Beta as lead developer.',
  messageType: 'coordination',
  timestamp: datetime({epochMillis: datetime().epochMillis - 43195000}).epochMillis,
  metadata: {
    taskBreakdown: ['system-design', 'backend-implementation', 'frontend-integration'],
    leadAgent: 'agent-seed-002'
  }
});

CREATE (msg12:ExpeditionMessage {
  id: 'message-seed-012',
  expeditionId: 'expedition-seed-002',
  role: 'agent',
  agentId: 'agent-seed-002',
  content: 'System design phase complete. Architecture includes OAuth 2.0 with PKCE, JWT tokens, Redis session store, and TOTP-based MFA. Security review passed.',
  messageType: 'result',
  timestamp: datetime({epochMillis: datetime().epochMillis - 28800000}).epochMillis,
  metadata: {
    taskId: 'task-seed-004',
    deliverable: 'system-architecture',
    securityFeatures: ['OAuth2-PKCE', 'JWT', 'Redis', 'TOTP-MFA']
  }
});

CREATE (msg13:ExpeditionMessage {
  id: 'message-seed-013',
  expeditionId: 'expedition-seed-002',
  role: 'agent',
  agentId: 'agent-seed-002',
  content: 'Backend implementation in progress. OAuth endpoints configured, JWT middleware implemented, MFA service integrated. Currently working on session management and rate limiting.',
  messageType: 'task-work',
  timestamp: datetime({epochMillis: datetime().epochMillis - 1800000}).epochMillis,
  metadata: {
    taskId: 'task-seed-005',
    progress: 0.75,
    completedComponents: ['oauth-endpoints', 'jwt-middleware', 'mfa-service']
  }
});

CREATE (msg14:ExpeditionMessage {
  id: 'message-seed-014',
  expeditionId: 'expedition-seed-002',
  role: 'user',
  userId: 'user-seed-001',
  content: 'Great progress! Please ensure the session timeout is configurable and add audit logging for all authentication events.',
  messageType: 'user-input',
  timestamp: datetime({epochMillis: datetime().epochMillis - 900000}).epochMillis,
  threadId: 'thread-auth-requirements',
  parentMessageId: 'message-seed-013',
  metadata: {
    additionalRequirements: ['configurable-timeout', 'audit-logging']
  }
});

// Messages for planning expedition (expedition-seed-003)
CREATE (msg15:ExpeditionMessage {
  id: 'message-seed-015',
  expeditionId: 'expedition-seed-003',
  role: 'user',
  userId: 'user-seed-002',
  content: 'We need a comprehensive content strategy for Q2 that will increase our brand awareness and engagement by 40%. Focus on thought leadership and community building.',
  messageType: 'user-input',
  timestamp: datetime({epochMillis: datetime().epochMillis - 21600000}).epochMillis,
  metadata: {
    goals: ['brand-awareness', 'engagement-increase'],
    targetIncrease: 0.4,
    focus: ['thought-leadership', 'community-building']
  }
});

CREATE (msg16:ExpeditionMessage {
  id: 'message-seed-016',
  expeditionId: 'expedition-seed-003',
  role: 'first-officer',
  content: 'Content strategy expedition initiated. Starting with content audit to understand current state and identify gaps. Creative Writer Gamma assigned as content strategist.',
  messageType: 'coordination',
  timestamp: datetime({epochMillis: datetime().epochMillis - 21595000}).epochMillis,
  metadata: {
    initialTask: 'content-audit',
    assignedAgent: 'agent-seed-003'
  }
});

CREATE (msg17:ExpeditionMessage {
  id: 'message-seed-017',
  expeditionId: 'expedition-seed-003',
  role: 'agent',
  agentId: 'agent-seed-003',
  content: 'Beginning content audit. Analyzing existing blog posts, social media content, whitepapers, and video content. Will identify content gaps and engagement patterns.',
  messageType: 'task-work',
  timestamp: datetime({epochMillis: datetime().epochMillis - 900000}).epochMillis,
  metadata: {
    taskId: 'task-seed-007',
    auditScope: ['blog-posts', 'social-media', 'whitepapers', 'videos']
  }
});

// Create message relationships
MATCH (e1:Expedition {id: 'expedition-seed-001'}), (m1:ExpeditionMessage {id: 'message-seed-001'})
CREATE (e1)-[:HAS_MESSAGE {timestamp: m1.timestamp}]->(m1);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (m2:ExpeditionMessage {id: 'message-seed-002'})
CREATE (e1)-[:HAS_MESSAGE {timestamp: m2.timestamp}]->(m2);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (m3:ExpeditionMessage {id: 'message-seed-003'})
CREATE (e1)-[:HAS_MESSAGE {timestamp: m3.timestamp}]->(m3);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (m4:ExpeditionMessage {id: 'message-seed-004'})
CREATE (e1)-[:HAS_MESSAGE {timestamp: m4.timestamp}]->(m4);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (m5:ExpeditionMessage {id: 'message-seed-005'})
CREATE (e1)-[:HAS_MESSAGE {timestamp: m5.timestamp}]->(m5);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (m6:ExpeditionMessage {id: 'message-seed-006'})
CREATE (e1)-[:HAS_MESSAGE {timestamp: m6.timestamp}]->(m6);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (m7:ExpeditionMessage {id: 'message-seed-007'})
CREATE (e1)-[:HAS_MESSAGE {timestamp: m7.timestamp}]->(m7);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (m8:ExpeditionMessage {id: 'message-seed-008'})
CREATE (e1)-[:HAS_MESSAGE {timestamp: m8.timestamp}]->(m8);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (m9:ExpeditionMessage {id: 'message-seed-009'})
CREATE (e1)-[:HAS_MESSAGE {timestamp: m9.timestamp}]->(m9);

MATCH (e2:Expedition {id: 'expedition-seed-002'}), (m10:ExpeditionMessage {id: 'message-seed-010'})
CREATE (e2)-[:HAS_MESSAGE {timestamp: m10.timestamp}]->(m10);

MATCH (e2:Expedition {id: 'expedition-seed-002'}), (m11:ExpeditionMessage {id: 'message-seed-011'})
CREATE (e2)-[:HAS_MESSAGE {timestamp: m11.timestamp}]->(m11);

MATCH (e2:Expedition {id: 'expedition-seed-002'}), (m12:ExpeditionMessage {id: 'message-seed-012'})
CREATE (e2)-[:HAS_MESSAGE {timestamp: m12.timestamp}]->(m12);

MATCH (e2:Expedition {id: 'expedition-seed-002'}), (m13:ExpeditionMessage {id: 'message-seed-013'})
CREATE (e2)-[:HAS_MESSAGE {timestamp: m13.timestamp}]->(m13);

MATCH (e2:Expedition {id: 'expedition-seed-002'}), (m14:ExpeditionMessage {id: 'message-seed-014'})
CREATE (e2)-[:HAS_MESSAGE {timestamp: m14.timestamp}]->(m14);

MATCH (e3:Expedition {id: 'expedition-seed-003'}), (m15:ExpeditionMessage {id: 'message-seed-015'})
CREATE (e3)-[:HAS_MESSAGE {timestamp: m15.timestamp}]->(m15);

MATCH (e3:Expedition {id: 'expedition-seed-003'}), (m16:ExpeditionMessage {id: 'message-seed-016'})
CREATE (e3)-[:HAS_MESSAGE {timestamp: m16.timestamp}]->(m16);

MATCH (e3:Expedition {id: 'expedition-seed-003'}), (m17:ExpeditionMessage {id: 'message-seed-017'})
CREATE (e3)-[:HAS_MESSAGE {timestamp: m17.timestamp}]->(m17);

// Create message threading relationships
MATCH (child:ExpeditionMessage {id: 'message-seed-014'}), (parent:ExpeditionMessage {id: 'message-seed-013'})
CREATE (child)-[:REPLIES_TO {timestamp: child.timestamp}]->(parent);

// Create user-message relationships
MATCH (u1:User {id: 'user-seed-001'}), (m1:ExpeditionMessage {id: 'message-seed-001'})
CREATE (u1)-[:SENT_MESSAGE {timestamp: m1.timestamp}]->(m1);

MATCH (u1:User {id: 'user-seed-001'}), (m10:ExpeditionMessage {id: 'message-seed-010'})
CREATE (u1)-[:SENT_MESSAGE {timestamp: m10.timestamp}]->(m10);

MATCH (u1:User {id: 'user-seed-001'}), (m14:ExpeditionMessage {id: 'message-seed-014'})
CREATE (u1)-[:SENT_MESSAGE {timestamp: m14.timestamp}]->(m14);

MATCH (u2:User {id: 'user-seed-002'}), (m15:ExpeditionMessage {id: 'message-seed-015'})
CREATE (u2)-[:SENT_MESSAGE {timestamp: m15.timestamp}]->(m15);

// Create agent-message relationships
MATCH (a1:Agent {id: 'agent-seed-001'}), (m3:ExpeditionMessage {id: 'message-seed-003'})
CREATE (a1)-[:SENT_MESSAGE {timestamp: m3.timestamp}]->(m3);

MATCH (a1:Agent {id: 'agent-seed-001'}), (m4:ExpeditionMessage {id: 'message-seed-004'})
CREATE (a1)-[:SENT_MESSAGE {timestamp: m4.timestamp}]->(m4);

MATCH (a1:Agent {id: 'agent-seed-001'}), (m5:ExpeditionMessage {id: 'message-seed-005'})
CREATE (a1)-[:SENT_MESSAGE {timestamp: m5.timestamp}]->(m5);

MATCH (a1:Agent {id: 'agent-seed-001'}), (m6:ExpeditionMessage {id: 'message-seed-006'})
CREATE (a1)-[:SENT_MESSAGE {timestamp: m6.timestamp}]->(m6);

MATCH (a2:Agent {id: 'agent-seed-002'}), (m7:ExpeditionMessage {id: 'message-seed-007'})
CREATE (a2)-[:SENT_MESSAGE {timestamp: m7.timestamp}]->(m7);

MATCH (a2:Agent {id: 'agent-seed-002'}), (m8:ExpeditionMessage {id: 'message-seed-008'})
CREATE (a2)-[:SENT_MESSAGE {timestamp: m8.timestamp}]->(m8);

MATCH (a2:Agent {id: 'agent-seed-002'}), (m12:ExpeditionMessage {id: 'message-seed-012'})
CREATE (a2)-[:SENT_MESSAGE {timestamp: m12.timestamp}]->(m12);

MATCH (a2:Agent {id: 'agent-seed-002'}), (m13:ExpeditionMessage {id: 'message-seed-013'})
CREATE (a2)-[:SENT_MESSAGE {timestamp: m13.timestamp}]->(m13);

MATCH (a3:Agent {id: 'agent-seed-003'}), (m17:ExpeditionMessage {id: 'message-seed-017'})
CREATE (a3)-[:SENT_MESSAGE {timestamp: m17.timestamp}]->(m17);

// ============================================================================
// SAMPLE EXPEDITION RESULTS
// ============================================================================

// Results for completed expedition
CREATE (result1:ExpeditionResult {
  id: 'result-seed-001',
  expeditionId: 'expedition-seed-001',
  title: 'AI Market Analysis Report',
  description: 'Comprehensive analysis of the AI market including size, competitors, and strategic recommendations',
  content: 'Executive Summary: The AI market presents significant opportunities with a TAM of $50B and growing at 25% CAGR. Key findings include enterprise adoption acceleration, competitive landscape consolidation, and emerging vertical specialization opportunities. Strategic recommendations focus on partnership-driven growth and vertical market penetration.',
  resultType: 'final-report',
  format: 'markdown',
  quality: {
    overall: 92,
    completeness: 95,
    accuracy: 90,
    relevance: 94,
    clarity: 88,
    assessedBy: 'user-seed-001',
    assessedAt: datetime({epochMillis: datetime().epochMillis - 72000000}).epochMillis,
    notes: 'Excellent comprehensive analysis with actionable insights'
  },
  createdBy: 'agent-seed-002',
  createdAt: datetime({epochMillis: datetime().epochMillis - 75600000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 75600000}).epochMillis,
  attachments: ['market-size-data.xlsx', 'competitor-matrix.pdf', 'recommendations-roadmap.png'],
  metadata: {
    wordCount: 2500,
    sections: ['executive-summary', 'market-analysis', 'competitor-analysis', 'recommendations'],
    dataPoints: 47,
    sources: 23
  }
});

CREATE (result2:ExpeditionResult {
  id: 'result-seed-002',
  expeditionId: 'expedition-seed-001',
  title: 'Market Size Analysis',
  description: 'Detailed breakdown of total addressable market, serviceable addressable market, and serviceable obtainable market',
  content: 'TAM Analysis: $50B total addressable market driven by enterprise AI adoption, automation demand, and regulatory compliance. SAM: $5B serviceable addressable market focusing on mid-market and enterprise segments. SOM: $500M serviceable obtainable market with 3-year capture timeline.',
  resultType: 'analysis',
  format: 'json',
  quality: {
    overall: 88,
    completeness: 90,
    accuracy: 92,
    relevance: 85,
    clarity: 86,
    assessedBy: 'agent-seed-002',
    assessedAt: datetime({epochMillis: datetime().epochMillis - 82800000}).epochMillis,
    notes: 'Solid quantitative analysis with good methodology'
  },
  createdBy: 'agent-seed-001',
  createdAt: datetime({epochMillis: datetime().epochMillis - 82800000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 82800000}).epochMillis,
  attachments: ['tam-sam-som-breakdown.json'],
  metadata: {
    methodology: 'bottom-up-analysis',
    dataPoints: 15,
    confidenceLevel: 0.92
  }
});

CREATE (result3:ExpeditionResult {
  id: 'result-seed-003',
  expeditionId: 'expedition-seed-001',
  title: 'Competitor Analysis Matrix',
  description: 'SWOT analysis and positioning matrix for top 10 AI market competitors',
  content: 'Competitor landscape analysis reveals three distinct tiers: Tier 1 (OpenAI, Google, Microsoft) dominate with comprehensive platforms, Tier 2 (Amazon, IBM, Anthropic) focus on enterprise/specialized solutions, Tier 3 (emerging players) target niche markets. Key differentiation opportunities identified in vertical specialization and integration capabilities.',
  resultType: 'analysis',
  format: 'markdown',
  quality: {
    overall: 85,
    completeness: 88,
    accuracy: 87,
    relevance: 82,
    clarity: 84,
    assessedBy: 'agent-seed-002',
    assessedAt: datetime({epochMillis: datetime().epochMillis - 79200000}).epochMillis,
    notes: 'Good competitive insights with clear positioning opportunities'
  },
  createdBy: 'agent-seed-001',
  createdAt: datetime({epochMillis: datetime().epochMillis - 79200000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 79200000}).epochMillis,
  attachments: ['competitor-swot-matrix.pdf', 'positioning-map.png'],
  metadata: {
    competitorsAnalyzed: 10,
    swotCategories: ['strengths', 'weaknesses', 'opportunities', 'threats'],
    positioningDimensions: ['capability', 'market-focus']
  }
});

CREATE (result4:ExpeditionResult {
  id: 'result-seed-004',
  expeditionId: 'expedition-seed-002',
  title: 'Authentication System Architecture',
  description: 'Complete system design for secure authentication with OAuth 2.0 and MFA',
  content: 'Authentication architecture implements OAuth 2.0 with PKCE for secure authorization, JWT tokens for stateless authentication, Redis for session management, and TOTP-based multi-factor authentication. Security features include rate limiting, audit logging, and configurable session timeouts.',
  resultType: 'design',
  format: 'markdown',
  quality: {
    overall: 94,
    completeness: 96,
    accuracy: 95,
    relevance: 92,
    clarity: 91,
    assessedBy: 'user-seed-001',
    assessedAt: datetime({epochMillis: datetime().epochMillis - 28800000}).epochMillis,
    notes: 'Excellent security-focused design with comprehensive coverage'
  },
  createdBy: 'agent-seed-002',
  createdAt: datetime({epochMillis: datetime().epochMillis - 28800000}).epochMillis,
  updatedAt: datetime({epochMillis: datetime().epochMillis - 28800000}).epochMillis,
  attachments: ['auth-architecture-diagram.png', 'security-checklist.pdf', 'api-specifications.yaml'],
  metadata: {
    securityStandards: ['OAuth2', 'PKCE', 'JWT', 'TOTP'],
    components: ['auth-service', 'token-service', 'mfa-service', 'session-store'],
    complianceFrameworks: ['OWASP', 'NIST']
  }
});

// Create result relationships
MATCH (e1:Expedition {id: 'expedition-seed-001'}), (r1:ExpeditionResult {id: 'result-seed-001'})
CREATE (e1)-[:HAS_RESULT {createdAt: r1.createdAt}]->(r1);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (r2:ExpeditionResult {id: 'result-seed-002'})
CREATE (e1)-[:HAS_RESULT {createdAt: r2.createdAt}]->(r2);

MATCH (e1:Expedition {id: 'expedition-seed-001'}), (r3:ExpeditionResult {id: 'result-seed-003'})
CREATE (e1)-[:HAS_RESULT {createdAt: r3.createdAt}]->(r3);

MATCH (e2:Expedition {id: 'expedition-seed-002'}), (r4:ExpeditionResult {id: 'result-seed-004'})
CREATE (e2)-[:HAS_RESULT {createdAt: r4.createdAt}]->(r4);

// Create creator relationships
MATCH (a1:Agent {id: 'agent-seed-001'}), (r2:ExpeditionResult {id: 'result-seed-002'})
CREATE (a1)-[:CREATED_RESULT {createdAt: r2.createdAt}]->(r2);

MATCH (a1:Agent {id: 'agent-seed-001'}), (r3:ExpeditionResult {id: 'result-seed-003'})
CREATE (a1)-[:CREATED_RESULT {createdAt: r3.createdAt}]->(r3);

MATCH (a2:Agent {id: 'agent-seed-002'}), (r1:ExpeditionResult {id: 'result-seed-001'})
CREATE (a2)-[:CREATED_RESULT {createdAt: r1.createdAt}]->(r1);

MATCH (a2:Agent {id: 'agent-seed-002'}), (r4:ExpeditionResult {id: 'result-seed-004'})
CREATE (a2)-[:CREATED_RESULT {createdAt: r4.createdAt}]->(r4);

// Log migration completion
CREATE (m:Migration {
  id: '007_expedition_messages_results_seed',
  name: 'Expedition Messages and Results Seed Data',
  description: 'Comprehensive seed data for expedition messages and results with realistic conversation flows',
  version: '1.0.0',
  dependencies: ['006_expedition_seed_data'],
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  seedDataStats: {
    messages: 17,
    results: 4,
    messageTypes: ['user-input', 'coordination', 'task-work', 'result', 'status-update'],
    resultTypes: ['final-report', 'analysis', 'design'],
    relationships: 38
  }
})
RETURN m.id as migrationId, m.appliedAt as appliedAt, m.seedDataStats as stats;