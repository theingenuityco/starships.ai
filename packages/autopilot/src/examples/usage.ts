/**
 * Usage Examples for Autopilot Agent Framework
 * 
 * Shows how to create and use agents with the framework
 */

import { AgentBuilder } from '../builder/AgentBuilder';
import { ChatExecutionHandler } from './ChatExecutionHandler';

/**
 * Example 1: Basic Agent Creation
 */
export function createBasicAgent() {
  const agent = new AgentBuilder()
    .setName('Customer Support Agent')
    .setDescription('Helps customers with their inquiries and issues')
    .setHandler(new ChatExecutionHandler())
    .build();
  
  return agent;
}

/**
 * Example 2: Agent with Custom ID
 */
export function createNamedAgent() {
  const agent = new AgentBuilder()
    .setId('support-agent-001')
    .setName('Senior Support Specialist')
    .setDescription('Advanced customer support with escalation capabilities')
    .setHandler(new ChatExecutionHandler())
    .build();
    
  return agent;
}

/**
 * Example 3: Complete Agent Usage Flow
 */
export async function demonstrateAgentUsage() {
  // Create agent
  const agent = createBasicAgent();
  
  // Initialize with context
  await agent.onInitialize({
    userId: 'user-123',
    starshipId: 'starship-456',
    services: {
      // Server would inject actual services here
      database: null,
      llm: null,
      memory: null
    }
  });
  
  // Execute requests
  const response1 = await agent.execute({
    message: 'Hello, I need help with my account',
    sessionId: 'session-789',
    metadata: {
      userType: 'premium',
      previousIssues: []
    }
  });
  
  console.log('Agent Response:', response1.content);
  
  const response2 = await agent.execute({
    message: 'Can you help me reset my password?',
    sessionId: 'session-789'
  });
  
  console.log('Agent Response:', response2.content);
  
  // Cleanup when done
  await agent.onDestroy();
  
  return [response1, response2];
}

/**
 * Example 4: Error Handling
 */
export async function demonstrateErrorHandling() {
  try {
    // This will fail - missing required fields
    const agent = new AgentBuilder()
      .setName('Incomplete Agent')
      // Missing description and handler
      .build();
      
  } catch (error) {
    console.log('Builder Error:', error.message);
  }
  
  try {
    // This will fail - invalid request
    const agent = createBasicAgent();
    await agent.onInitialize({ userId: 'user-123' });
    
    await agent.execute({
      message: '', // Empty message
      sessionId: 'session-123'
    });
    
  } catch (error) {
    console.log('Execution Error:', error.message);
  }
}