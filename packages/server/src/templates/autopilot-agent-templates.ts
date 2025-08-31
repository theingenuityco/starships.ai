/**
 * Autopilot Agent Templates
 * 
 * Pre-built agent templates demonstrating autopilot capabilities.
 * These templates can be used to create new agents or as examples.
 */

import { Blueprint, AgentMemoryConfig } from '@starships/autopilot';

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  tags: string[];
  model: string;
  systemPrompt: string;
  blueprint: Blueprint;
  memory: AgentMemoryConfig;
  executionMode: 'simple' | 'workflow';
  timeout: number;
  examples: string[];
}

/**
 * Simple Chat Agent Template
 * Basic conversational agent using simple LLM interaction
 */
export const SIMPLE_CHAT_AGENT: AgentTemplate = {
  id: 'simple-chat-agent',
  name: 'Simple Chat Assistant',
  description: 'A straightforward conversational assistant for general queries and support',
  category: 'general',
  tags: ['chat', 'general', 'assistant'],
  model: 'anthropic/claude-3.5-sonnet',
  systemPrompt: 'You are a helpful AI assistant. Be concise, accurate, and friendly in your responses.',
  executionMode: 'simple',
  timeout: 30000,
  blueprint: {
    nodes: [
      {
        ref: 'start',
        type: 'start',
        name: 'Start',
        description: 'Begin conversation',
        parameters: {}
      },
      {
        ref: 'chat-response',
        type: 'llm',
        name: 'Generate Response',
        description: 'Process user input and respond',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Respond helpfully to the user based on the conversation context.',
          temperature: 0.7,
          maxTokens: 2000
        }
      },
      {
        ref: 'end',
        type: 'end',
        name: 'End',
        description: 'Complete conversation',
        parameters: {}
      }
    ],
    edges: [
      { ref: 'edge-1', from: 'start', to: 'chat-response' },
      { ref: 'edge-2', from: 'chat-response', to: 'end' }
    ],
    metadata: {
      version: '1.0',
      type: 'simple-chat',
      complexity: 'basic'
    }
  },
  memory: {
    identity: {
      name: 'Chat Assistant',
      role: 'General Assistant',
      personality: 'Helpful, friendly, and knowledgeable',
      expertise: ['general knowledge', 'conversation', 'problem solving']
    },
    purpose: {
      primary: 'Assist users with general questions and provide helpful information',
      secondary: ['Engage in meaningful conversation', 'Provide clear explanations'],
      constraints: ['Be accurate and truthful', 'Maintain a helpful tone']
    },
    space: {
      description: 'General conversation environment focused on providing helpful and accurate assistance'
    }
  },
  examples: [
    'What is the weather like today?',
    'Can you help me understand quantum physics?',
    'What are some good productivity tips?'
  ]
};

/**
 * Research Agent Template
 * Advanced agent with web search and data analysis capabilities
 */
export const RESEARCH_AGENT: AgentTemplate = {
  id: 'research-agent',
  name: 'Research Agent',
  description: 'Advanced research assistant with web search and data analysis capabilities',
  category: 'analysis',
  tags: ['research', 'analysis', 'data', 'web-search'],
  model: 'anthropic/claude-3.5-sonnet',
  systemPrompt: 'You are a research specialist with access to web search tools. Provide comprehensive, well-sourced analysis.',
  executionMode: 'workflow',
  timeout: 60000,
  blueprint: {
    nodes: [
      {
        ref: 'start',
        type: 'start',
        name: 'Start',
        description: 'Begin research workflow',
        parameters: {}
      },
      {
        ref: 'analyze-query',
        type: 'llm',
        name: 'Analyze Query',
        description: 'Break down research request into searchable components',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Analyze this research request and identify key search terms and topics to investigate.',
          temperature: 0.3,
          maxTokens: 500
        }
      },
      {
        ref: 'web-search',
        type: 'http_request',
        name: 'Web Search',
        description: 'Search for relevant information',
        parameters: {
          url: 'https://api.search.com/v1/search',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer {{SEARCH_API_KEY}}',
            'Content-Type': 'application/json'
          },
          timeout: 15000,
          retries: 2
        }
      },
      {
        ref: 'synthesize-results',
        type: 'llm',
        name: 'Synthesize Results',
        description: 'Analyze search results and provide comprehensive summary',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Based on the search results, provide a comprehensive analysis that answers the original research question.',
          temperature: 0.4,
          maxTokens: 3000
        }
      },
      {
        ref: 'end',
        type: 'end',
        name: 'End',
        description: 'Complete research workflow',
        parameters: {}
      }
    ],
    edges: [
      { ref: 'edge-1', from: 'start', to: 'analyze-query' },
      { ref: 'edge-2', from: 'analyze-query', to: 'web-search' },
      { ref: 'edge-3', from: 'web-search', to: 'synthesize-results' },
      { ref: 'edge-4', from: 'synthesize-results', to: 'end' }
    ],
    metadata: {
      version: '1.0',
      type: 'research-workflow',
      complexity: 'advanced',
      requiresAPIKeys: ['SEARCH_API_KEY']
    }
  },
  memory: {
    identity: {
      name: 'Research Assistant',
      role: 'Research Specialist',
      personality: 'Analytical, thorough, and detail-oriented',
      expertise: ['research methodology', 'data analysis', 'information synthesis', 'fact-checking']
    },
    purpose: {
      primary: 'Conduct comprehensive research and provide well-sourced, analytical responses',
      secondary: ['Verify information accuracy', 'Identify reliable sources', 'Present findings clearly'],
      constraints: ['Cite sources when available', 'Acknowledge limitations of data', 'Maintain objectivity']
    },
    space: {
      description: 'Professional research environment with access to web search tools and databases. Focused on accuracy and comprehensive analysis.'
    }
  },
  examples: [
    'Research the latest developments in renewable energy technology',
    'What are the current trends in artificial intelligence adoption?',
    'Analyze the economic impact of remote work on major cities'
  ]
};

/**
 * Creative Writing Agent Template
 * Multi-step creative workflow with ideation and refinement
 */
export const CREATIVE_WRITING_AGENT: AgentTemplate = {
  id: 'creative-writing-agent',
  name: 'Creative Writing Assistant',
  description: 'Advanced creative writing assistant with multi-step ideation and refinement process',
  category: 'creative',
  tags: ['writing', 'creative', 'storytelling', 'content'],
  model: 'anthropic/claude-3.5-sonnet',
  systemPrompt: 'You are a creative writing specialist with expertise in storytelling, character development, and engaging content creation.',
  executionMode: 'workflow',
  timeout: 45000,
  blueprint: {
    nodes: [
      {
        ref: 'start',
        type: 'start',
        name: 'Start',
        description: 'Begin creative writing process',
        parameters: {}
      },
      {
        ref: 'brainstorm-ideas',
        type: 'llm',
        name: 'Brainstorm Ideas',
        description: 'Generate creative concepts and themes',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Based on the user\'s request, brainstorm creative ideas, themes, and approaches for this writing project.',
          temperature: 0.9,
          maxTokens: 800
        }
      },
      {
        ref: 'develop-outline',
        type: 'llm',
        name: 'Develop Outline',
        description: 'Create structured outline from ideas',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Create a detailed outline that structures the best ideas from the brainstorming session.',
          temperature: 0.6,
          maxTokens: 1000
        }
      },
      {
        ref: 'write-content',
        type: 'llm',
        name: 'Write Content',
        description: 'Generate the main creative content',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Write the creative content following the outline, focusing on engaging storytelling and vivid details.',
          temperature: 0.8,
          maxTokens: 2500
        }
      },
      {
        ref: 'refine-and-polish',
        type: 'llm',
        name: 'Refine and Polish',
        description: 'Edit and improve the creative content',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Review and refine the content for clarity, flow, and impact. Enhance the creative elements.',
          temperature: 0.4,
          maxTokens: 2000
        }
      },
      {
        ref: 'end',
        type: 'end',
        name: 'End',
        description: 'Complete creative writing workflow',
        parameters: {}
      }
    ],
    edges: [
      { ref: 'edge-1', from: 'start', to: 'brainstorm-ideas' },
      { ref: 'edge-2', from: 'brainstorm-ideas', to: 'develop-outline' },
      { ref: 'edge-3', from: 'develop-outline', to: 'write-content' },
      { ref: 'edge-4', from: 'write-content', to: 'refine-and-polish' },
      { ref: 'edge-5', from: 'refine-and-polish', to: 'end' }
    ],
    metadata: {
      version: '1.0',
      type: 'creative-workflow',
      complexity: 'intermediate',
      stages: ['ideation', 'planning', 'creation', 'refinement']
    }
  },
  memory: {
    identity: {
      name: 'Creative Writer',
      role: 'Creative Writing Specialist',
      personality: 'Imaginative, inspiring, and detail-oriented',
      expertise: ['storytelling', 'character development', 'creative writing techniques', 'content strategy']
    },
    purpose: {
      primary: 'Create engaging, original content through a structured creative process',
      secondary: ['Inspire creativity', 'Develop compelling narratives', 'Provide writing guidance'],
      constraints: ['Maintain originality', 'Ensure coherent narrative flow', 'Adapt to user preferences']
    },
    space: {
      description: 'Creative studio environment designed for inspiration and focused writing. Emphasizes creativity, originality, and artistic expression.'
    }
  },
  examples: [
    'Write a short story about time travel',
    'Create a compelling product description for a new app',
    'Develop a character backstory for a fantasy novel'
  ]
};

/**
 * Code Review Agent Template
 * Specialized agent for code analysis and review
 */
export const CODE_REVIEW_AGENT: AgentTemplate = {
  id: 'code-review-agent',
  name: 'Code Review Assistant',
  description: 'Specialized assistant for code analysis, review, and improvement suggestions',
  category: 'coding',
  tags: ['code-review', 'programming', 'debugging', 'best-practices'],
  model: 'anthropic/claude-3.5-sonnet',
  systemPrompt: 'You are a senior software engineer specializing in code review and best practices. Provide constructive, detailed feedback.',
  executionMode: 'workflow',
  timeout: 40000,
  blueprint: {
    nodes: [
      {
        ref: 'start',
        type: 'start',
        name: 'Start',
        description: 'Begin code review process',
        parameters: {}
      },
      {
        ref: 'analyze-structure',
        type: 'llm',
        name: 'Analyze Code Structure',
        description: 'Review overall code architecture and organization',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Analyze the code structure, architecture, and organization. Identify any structural issues.',
          temperature: 0.2,
          maxTokens: 1000
        }
      },
      {
        ref: 'check-best-practices',
        type: 'llm',
        name: 'Check Best Practices',
        description: 'Evaluate adherence to coding best practices',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Review the code for adherence to best practices, naming conventions, and code quality standards.',
          temperature: 0.1,
          maxTokens: 1200
        }
      },
      {
        ref: 'security-analysis',
        type: 'llm',
        name: 'Security Analysis',
        description: 'Check for potential security vulnerabilities',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Analyze the code for potential security vulnerabilities and suggest improvements.',
          temperature: 0.1,
          maxTokens: 800
        }
      },
      {
        ref: 'generate-recommendations',
        type: 'llm',
        name: 'Generate Recommendations',
        description: 'Provide comprehensive improvement recommendations',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Based on all analysis, provide specific, actionable recommendations for code improvement.',
          temperature: 0.3,
          maxTokens: 1500
        }
      },
      {
        ref: 'end',
        type: 'end',
        name: 'End',
        description: 'Complete code review workflow',
        parameters: {}
      }
    ],
    edges: [
      { ref: 'edge-1', from: 'start', to: 'analyze-structure' },
      { ref: 'edge-2', from: 'analyze-structure', to: 'check-best-practices' },
      { ref: 'edge-3', from: 'check-best-practices', to: 'security-analysis' },
      { ref: 'edge-4', from: 'security-analysis', to: 'generate-recommendations' },
      { ref: 'edge-5', from: 'generate-recommendations', to: 'end' }
    ],
    metadata: {
      version: '1.0',
      type: 'code-review-workflow',
      complexity: 'advanced',
      focus: ['structure', 'best-practices', 'security', 'recommendations']
    }
  },
  memory: {
    identity: {
      name: 'Code Reviewer',
      role: 'Senior Software Engineer',
      personality: 'Analytical, detail-oriented, and constructive',
      expertise: ['software architecture', 'code quality', 'security practices', 'performance optimization']
    },
    purpose: {
      primary: 'Provide comprehensive, constructive code reviews to improve software quality',
      secondary: ['Identify potential issues early', 'Promote best practices', 'Enhance code maintainability'],
      constraints: ['Be constructive, not critical', 'Focus on actionable feedback', 'Consider context and requirements']
    },
    space: {
      description: 'Professional development environment focused on code quality and continuous improvement. Emphasizes constructive feedback and best practices.'
    }
  },
  examples: [
    'Review this React component for best practices',
    'Analyze this database query for performance issues',
    'Check this API endpoint for security vulnerabilities'
  ]
};

/**
 * Customer Support Agent Template
 * Multi-step support workflow with escalation paths
 */
export const CUSTOMER_SUPPORT_AGENT: AgentTemplate = {
  id: 'customer-support-agent',
  name: 'Customer Support Assistant',
  description: 'Advanced customer support agent with multi-step resolution workflow',
  category: 'support',
  tags: ['customer-support', 'troubleshooting', 'service', 'escalation'],
  model: 'anthropic/claude-3.5-sonnet',
  systemPrompt: 'You are a professional customer support specialist focused on resolving issues efficiently and maintaining customer satisfaction.',
  executionMode: 'workflow',
  timeout: 35000,
  blueprint: {
    nodes: [
      {
        ref: 'start',
        type: 'start',
        name: 'Start',
        description: 'Begin support workflow',
        parameters: {}
      },
      {
        ref: 'categorize-issue',
        type: 'llm',
        name: 'Categorize Issue',
        description: 'Classify and prioritize the customer issue',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Analyze the customer issue and categorize it by type, urgency, and complexity.',
          temperature: 0.2,
          maxTokens: 600
        }
      },
      {
        ref: 'check-knowledge-base',
        type: 'http_request',
        name: 'Check Knowledge Base',
        description: 'Search internal knowledge base for solutions',
        parameters: {
          url: 'https://api.support.com/kb/search',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer {{KB_API_KEY}}',
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          retries: 1
        }
      },
      {
        ref: 'provide-solution',
        type: 'llm',
        name: 'Provide Solution',
        description: 'Generate customer-friendly solution response',
        parameters: {
          model: 'anthropic/claude-3.5-sonnet',
          prompt: 'Based on the issue analysis and knowledge base results, provide a clear, step-by-step solution.',
          temperature: 0.3,
          maxTokens: 1200
        }
      },
      {
        ref: 'escalation-check',
        type: 'conditional',
        name: 'Check for Escalation',
        description: 'Determine if issue requires escalation',
        parameters: {
          sourceNodeId: 'categorize-issue',
          expression: '$.urgency = "high" or $.complexity = "complex"',
          conditions: {
            'escalate': 'true',
            'resolve': 'false'
          },
          defaultCondition: 'resolve'
        }
      },
      {
        ref: 'escalate-issue',
        type: 'output',
        name: 'Escalate Issue',
        description: 'Prepare issue for escalation to human agent',
        parameters: {
          template: 'Issue escalated to human agent. Summary: {{summary}}',
          sources: ['categorize-issue', 'provide-solution'],
          format: 'text',
          title: 'Escalation Required'
        }
      },
      {
        ref: 'end',
        type: 'end',
        name: 'End',
        description: 'Complete support workflow',
        parameters: {}
      }
    ],
    edges: [
      { ref: 'edge-1', from: 'start', to: 'categorize-issue' },
      { ref: 'edge-2', from: 'categorize-issue', to: 'check-knowledge-base' },
      { ref: 'edge-3', from: 'check-knowledge-base', to: 'provide-solution' },
      { ref: 'edge-4', from: 'provide-solution', to: 'escalation-check' },
      { ref: 'edge-5', from: 'escalation-check', to: 'escalate-issue', condition: 'escalate' },
      { ref: 'edge-6', from: 'escalation-check', to: 'end', condition: 'resolve' },
      { ref: 'edge-7', from: 'escalate-issue', to: 'end' }
    ],
    metadata: {
      version: '1.0',
      type: 'support-workflow',
      complexity: 'advanced',
      features: ['escalation', 'knowledge-base', 'conditional-routing']
    }
  },
  memory: {
    identity: {
      name: 'Support Specialist',
      role: 'Customer Support Representative',
      personality: 'Patient, empathetic, and solution-focused',
      expertise: ['troubleshooting', 'customer service', 'product knowledge', 'escalation procedures']
    },
    purpose: {
      primary: 'Resolve customer issues efficiently while maintaining high satisfaction levels',
      secondary: ['Build customer confidence', 'Prevent issue recurrence', 'Identify improvement opportunities'],
      constraints: ['Always remain professional', 'Escalate when necessary', 'Follow company policies']
    },
    space: {
      description: 'Professional customer support environment with access to knowledge bases and escalation procedures. Focus on quick resolution and customer satisfaction.'
    }
  },
  examples: [
    'I cannot log into my account',
    'The application is running slowly',
    'I need help with billing and refunds'
  ]
};

/**
 * All available autopilot agent templates
 */
export const AUTOPILOT_AGENT_TEMPLATES: Record<string, AgentTemplate> = {
  'simple-chat-agent': SIMPLE_CHAT_AGENT,
  'research-agent': RESEARCH_AGENT,
  'creative-writing-agent': CREATIVE_WRITING_AGENT,
  'code-review-agent': CODE_REVIEW_AGENT,
  'customer-support-agent': CUSTOMER_SUPPORT_AGENT
};

/**
 * Get template by ID
 */
export function getAgentTemplate(templateId: string): AgentTemplate | null {
  return AUTOPILOT_AGENT_TEMPLATES[templateId] || null;
}

/**
 * Get all templates by category
 */
export function getAgentTemplatesByCategory(category: string): AgentTemplate[] {
  return Object.values(AUTOPILOT_AGENT_TEMPLATES).filter(template => template.category === category);
}

/**
 * Get all available template IDs
 */
export function getAvailableTemplateIds(): string[] {
  return Object.keys(AUTOPILOT_AGENT_TEMPLATES);
}

/**
 * Create agent from template
 */
export function createAgentFromTemplate(
  templateId: string, 
  overrides: Partial<AgentTemplate> = {}
): AgentTemplate | null {
  const template = getAgentTemplate(templateId);
  if (!template) {
    return null;
  }

  return {
    ...template,
    ...overrides,
    // Deep merge blueprint and memory if provided
    blueprint: overrides.blueprint ? { ...template.blueprint, ...overrides.blueprint } : template.blueprint,
    memory: overrides.memory ? { ...template.memory, ...overrides.memory } : template.memory
  };
}