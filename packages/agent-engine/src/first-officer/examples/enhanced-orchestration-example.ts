/**
 * Enhanced First Officer Agent Integration Example
 * 
 * Demonstrates how to use the EnhancedFirstOfficerAgentV2 with:
 * - Vision parsing
 * - Parallel task execution
 * - Real-time WebSocket updates
 * - Quality assurance and retry logic
 */

import { EnhancedFirstOfficerAgentV2 } from '../EnhancedFirstOfficerAgentV2';
import { WebSocketEventEmitter } from '../parallel/WebSocketEventEmitter';
import { LangChainMemoryStore } from '../../memory/langchain-memory';
import { RepositoryFactory } from '@starships/models';

/**
 * Example: Initialize and use the Enhanced First Officer Agent
 */
async function enhancedOrchestrationExample() {
  // Initialize memory store
  const memoryStore = new LangChainMemoryStore();

  // Initialize WebSocket event emitter (would connect to actual Socket.IO server)
  const wsEmitter = new WebSocketEventEmitter();
  
  // In production, set the actual Socket.IO server
  // wsEmitter.setSocketServer(socketIOServer);

  // Configure enhanced First Officer
  const config = {
    enableVisionParsing: true,
    enableParallelExecution: true,
    autoEscalation: true,
    parallelExecutionOptions: {
      maxConcurrentTasks: 5,
      taskTimeout: 300000, // 5 minutes
      enableResourceOptimization: true,
      enableAdaptiveScheduling: true,
      progressUpdateInterval: 2000 // 2 seconds
    },
    wsEventEmitter: wsEmitter
  };

  // Pre-selected agent IDs (required)
  const selectedAgentIds = [
    'agent-001-researcher',
    'agent-002-developer', 
    'agent-003-analyst',
    'agent-004-designer'
  ];

  // Initialize Enhanced First Officer
  const firstOfficer = new EnhancedFirstOfficerAgentV2(
    'starship-123',
    memoryStore,
    config,
    selectedAgentIds
  );

  // Subscribe to WebSocket events for real-time updates
  setupEventListeners(wsEmitter);

  // Start an expedition with vision-based orchestration
  const expeditionId = 'expedition-456';
  const userId = 'user-789';
  const objective = 'Build a comprehensive data analytics dashboard with real-time visualization';

  try {
    console.log('🚀 Starting enhanced expedition orchestration...');
    
    // Start expedition (will parse vision and orchestrate tasks)
    const result = await firstOfficer.startExpedition(
      expeditionId,
      userId,
      objective
    );
    
    console.log('✅ Expedition completed:', result);
    
    // Get final metrics
    const metrics = await firstOfficer.getExecutionMetrics(expeditionId);
    console.log('📊 Execution metrics:', metrics);
    
  } catch (error) {
    console.error('❌ Expedition failed:', error);
  }
}

/**
 * Setup WebSocket event listeners for real-time monitoring
 */
function setupEventListeners(wsEmitter: WebSocketEventEmitter) {
  // Expedition-level events
  wsEmitter.on('expedition:vision-parsed', (data) => {
    console.log('👁️ Vision parsed:', data.requirements);
  });

  wsEmitter.on('expedition:execution-start', (data) => {
    console.log(`🎯 Starting execution: ${data.taskCount} tasks, ${data.agentCount} agents`);
  });

  wsEmitter.on('expedition:progress', (data) => {
    console.log(`📈 Progress: ${data.progress.toFixed(1)}% (${data.completedTasks}/${data.totalTasks})`);
  });

  wsEmitter.on('expedition:detailed-progress', (data) => {
    console.log(`📊 Detailed progress:`, {
      throughput: `${data.throughput.toFixed(2)} tasks/min`,
      estimatedTimeRemaining: `${data.estimatedTimeRemaining.toFixed(0)} min`,
      resourceUtilization: data.resourceUtilization
    });
  });

  // Task-level events
  wsEmitter.on('task:start', (data) => {
    console.log(`▶️ Task ${data.taskId} started by agent ${data.agentId}`);
  });

  wsEmitter.on('task:complete', (data) => {
    console.log(`✅ Task ${data.taskId} completed in ${data.duration.toFixed(1)} minutes`);
  });

  wsEmitter.on('task:failed', (data) => {
    console.log(`❌ Task ${data.taskId} failed: ${data.error}`);
  });

  wsEmitter.on('task:retry', (data) => {
    console.log(`🔄 Retrying task ${data.taskId} (attempt ${data.attempt})`);
  });

  // Resource and performance events
  wsEmitter.on('performance:bottleneck', (data) => {
    console.warn(`⚠️ Performance bottleneck detected:`, data);
  });

  wsEmitter.on('performance:optimization', (data) => {
    console.log(`⚡ Performance optimization applied:`, data);
  });
}

/**
 * Example: Handle quality failures with agent reassignment
 */
async function handleQualityFailureExample(
  firstOfficer: EnhancedFirstOfficerAgentV2,
  expeditionId: string
) {
  // Simulate a quality check failure scenario
  const failedTaskId = 'task-789';
  const alternativeAgentId = 'agent-005-specialist';
  
  try {
    // Reassign task to specialist agent
    await firstOfficer.reassignTask(
      expeditionId,
      failedTaskId,
      alternativeAgentId,
      'Quality check failed - reassigning to specialist'
    );
    
    console.log('✅ Task reassigned successfully');
  } catch (error) {
    console.error('❌ Failed to reassign task:', error);
  }
}

/**
 * Example: Resume an interrupted expedition
 */
async function resumeExpeditionExample(
  firstOfficer: EnhancedFirstOfficerAgentV2,
  expeditionId: string
) {
  try {
    console.log('🔄 Resuming expedition...');
    
    // Check current status
    const status = await firstOfficer.getExpeditionStatus(expeditionId);
    console.log('Current status:', status);
    
    // Resume from saved state
    const result = await firstOfficer.resumeExpedition(expeditionId);
    console.log('✅ Expedition resumed and completed:', result);
    
  } catch (error) {
    console.error('❌ Failed to resume expedition:', error);
  }
}

/**
 * Example: Interactive user guidance during expedition
 */
async function interactiveGuidanceExample(
  firstOfficer: EnhancedFirstOfficerAgentV2,
  expeditionId: string
) {
  // Simulate user providing additional context
  const userMessage = "Focus on performance metrics and ensure the dashboard loads in under 2 seconds";
  
  try {
    const response = await firstOfficer.handleUserMessage(expeditionId, userMessage);
    console.log('🤖 First Officer response:', response.reply);
  } catch (error) {
    console.error('❌ Failed to handle user message:', error);
  }
}

// Export examples for use
export {
  enhancedOrchestrationExample,
  handleQualityFailureExample,
  resumeExpeditionExample,
  interactiveGuidanceExample
};