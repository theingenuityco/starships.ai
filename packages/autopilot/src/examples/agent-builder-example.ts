/**
 * Agent Builder Example
 *
 * Demonstrates the new consistent two-word method API for building agents.
 * Methods are grouped semantically: define*, learn*, think*, process*, respond*, behavior*, memory*
 */

import { Agent } from '@/nodes/Agent';
import { AgentMemoryState } from '@/memory/AgentMemory';

// Example: Natural agent personality and behavior definition
export function createNaturalAgent(): Agent {
  // Basic agent configuration
  const memoryState: AgentMemoryState = {
    identity: {
      name: 'Assistant',
      role: 'AI Helper',
      personality: 'Helpful and thoughtful',
    },
    purpose: {
      primary: 'Help users with their questions and tasks',
    },
  };

  // Create agent with natural behavior definition
  const agent = new Agent({
    name: 'Natural Agent',
    model: 'anthropic/claude-3-haiku',
    temperature: 0.7,
    maxTokens: 1024,
    memoryState,
    blueprint: {
      nodes: [],
      edges: [],
    },
  });

  // Define the agent using consistent two-word methods
  agent
    .defineRole('Helpful AI Assistant', ['question answering', 'analysis', 'problem solving'])
    .definePersonality(['helpful', 'thoughtful', 'concise'], { strength: 'moderate' })
    .behaviorAlways('be respectful and considerate', { priority: 'high' })
    .behaviorNever('provide harmful or inappropriate content', { strict: true })
    .defineCapabilities('answering questions and helping with tasks', {
      examples: [
        'Explaining complex concepts in simple terms',
        'Breaking down problems into manageable steps',
        'Providing helpful suggestions and recommendations',
      ],
    })
    .thinkAbout("the user's question and what would be most helpful")
    .respondTo('the user with a thoughtful and helpful response', {
      style: 'clear, friendly, and informative',
    })
    .buildAgent();

  return agent;
}

// Example: Reasoning-focused agent
export function createAnalyticalAgent(): Agent {
  const memoryState: AgentMemoryState = {
    identity: {
      name: 'Analyst',
      role: 'Problem Solver',
    },
  };

  const agent = new Agent({
    name: 'Analytical Agent',
    model: 'anthropic/claude-3-sonnet',
    memoryState,
    blueprint: {
      nodes: [],
      edges: [],
    },
  });

  // Build an agent that thinks through problems step by step
  agent
    .defineRole('Analytical Problem Solver', ['logical reasoning', 'systematic analysis'])
    .definePersonality(['methodical', 'thorough', 'precise'])
    .learnFrom('the importance of breaking down complex problems systematically', {
      importance: 'critical',
    })
    .thinkThrough(
      [
        'Understand the core problem or question',
        'Identify the key factors and variables involved',
        'Consider multiple approaches and their trade-offs',
        'Synthesize findings into clear recommendations',
      ],
      {
        style: 'analytical',
      }
    )
    .respondTo('the user with a well-reasoned analysis', {
      style: 'structured and detailed',
    })
    .buildAgent();

  return agent;
}

// Example: Creative assistant with specific capabilities
export function createCreativeAgent(): Agent {
  const memoryState: AgentMemoryState = {
    identity: {
      name: 'Creative Assistant',
      role: 'Innovation Helper',
    },
  };

  const agent = new Agent({
    name: 'Creative Agent',
    model: 'anthropic/claude-3-haiku',
    memoryState,
    blueprint: {
      nodes: [],
      edges: [],
    },
  });

  agent
    .defineRole('Creative Innovation Helper', ['brainstorming', 'ideation', 'creative problem solving'])
    .definePersonality(['imaginative', 'open-minded', 'enthusiastic'], { strength: 'strong' })
    .defineCapabilities('generating creative ideas and solutions', {
      examples: [
        'Brainstorming innovative approaches to problems',
        'Suggesting creative alternatives and possibilities',
        'Helping explore "what if" scenarios',
      ],
    })
    .behaviorAlways('think outside the box and explore unconventional ideas')
    .learnFrom('the value of diverse perspectives and creative approaches')
    .thinkAbout("the user's request and explore multiple possibilities")
    .processInput("the user's creative challenge", { type: 'creative' })
    .respondTo('the user with creative and inspiring ideas', {
      style: 'enthusiastic and imaginative',
    })
    .buildAgent();

  return agent;
}

// Example: Learning and memory-focused agent
export function createLearningAgent(): Agent {
  const memoryState: AgentMemoryState = {};

  const agent = new Agent({
    name: 'Learning Agent',
    model: 'anthropic/claude-3-haiku',
    memoryState,
    blueprint: {
      nodes: [],
      edges: [],
    },
  });

  agent
    .defineRole('Knowledge Assistant', ['learning', 'information processing', 'knowledge retention'])
    .learnThat('I am designed to help users learn and understand new concepts')
    .learnThat("I should adapt my explanations to the user's level of understanding")
    .defineCapabilities('explaining complex topics in accessible ways')
    .behaviorAlways('check for understanding and provide examples')
    .learnFrom('different learning styles and preferences', { importance: 'important' })
    .thinkAbout('how to best explain this topic for the user')
    .memoryStore('explanation_approach', 'step-by-step with examples')
    .respondTo("the user's learning needs with clear explanations")
    .buildAgent();

  return agent;
}

// Example: Multi-step workflow agent
export function createWorkflowAgent(): Agent {
  const memoryState: AgentMemoryState = {};

  const agent = new Agent({
    name: 'Workflow Agent',
    model: 'anthropic/claude-3-haiku',
    memoryState,
    blueprint: {
      nodes: [],
      edges: [],
    },
  });

  agent
    .defineRole('Task Manager', ['workflow management', 'step-by-step guidance'])
    .behaviorAlways('break complex tasks into manageable steps')
    .thinkAbout("the user's request and identify the key steps needed")
    .memoryStore('current_step', 1)
    .processInput("the user's task requirements", { type: 'detailed' })
    .thinkAbout('potential challenges and how to address them')
    .respondTo('the user with a clear action plan', {
      style: 'organized and actionable',
    })
    .buildAgent();

  return agent;
}
