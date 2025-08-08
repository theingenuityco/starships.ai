/**
 * End-to-End Workflow DSL Integration Tests
 * 
 * Comprehensive tests for the complete workflow DSL system including:
 * - Workflow generation
 * - User approval
 * - Workflow execution
 * - Node handlers (Agent, Conditional, UserPrompt)
 * - Error handling and recovery
 */

import { 
  WorkflowDSL,
  WorkflowDSLNode,
  WorkflowDSLEdge,
  WorkflowGenerationRequest,
  WorkflowExecutionContext,
  AgentNodeParameters,
  ConditionalNodeParameters,
  UserPromptNodeParameters
} from '@starships/protocol';
import { 
  WorkflowGenerationService,
  WorkflowExecutionService,
  workflowNodeRegistry,
  AgentNodeHandler,
  ConditionalNodeHandler,
  UserPromptNodeHandler
} from '../../src/services';
import { v4 as uuidv4 } from 'uuid';

describe('Workflow DSL End-to-End Integration Tests', () => {
  let workflowGenerationService: WorkflowGenerationService;
  let workflowExecutionService: WorkflowExecutionService;
  let userPromptHandler: UserPromptNodeHandler;

  beforeAll(async () => {
    // Initialize services
    workflowGenerationService = new WorkflowGenerationService();
    workflowExecutionService = WorkflowExecutionService.getInstance();
    
    // Get user prompt handler for manual response injection
    const handler = workflowNodeRegistry.getHandler('user_prompt') as UserPromptNodeHandler;
    userPromptHandler = handler;
  });

  describe('6.1.1 Simple Linear Workflow Tests', () => {
    test('should generate and execute a simple linear workflow', async () => {
      // Arrange
      const expeditionId = uuidv4();
      const request: WorkflowGenerationRequest = {
        expeditionId,
        objective: 'Create a simple data processing workflow',
        taskBreakdown: [
          {
            id: 'task-1',
            title: 'Extract Data',
            description: 'Extract data from source system',
            estimatedTime: 10
          },
          {
            id: 'task-2', 
            title: 'Process Data',
            description: 'Transform and clean the extracted data',
            estimatedTime: 15
          }
        ],
        selectedAgents: [
          {
            agentId: 'agent-1',
            agentName: 'Data Extractor',
            skills: ['data_extraction', 'api_integration'],
            availability: 'available',
            assignedTasks: []
          },
          {
            agentId: 'agent-2',
            agentName: 'Data Processor', 
            skills: ['data_transformation', 'cleaning'],
            availability: 'available',
            assignedTasks: []
          }
        ],
        complexity: 'simple'
      };

      // Act - Generate workflow
      const generationResult = await workflowGenerationService.generateWorkflow(request);
      
      // Assert - Workflow generation
      expect(generationResult.workflow).toBeDefined();
      expect(generationResult.confidence).toBeGreaterThan(0.7);
      expect(generationResult.workflow.nodes.length).toBeGreaterThan(3); // start + agents + end
      
      const workflow = generationResult.workflow;
      
      // Validate workflow structure
      const startNodes = workflow.nodes.filter(n => n.type === 'start');
      const agentNodes = workflow.nodes.filter(n => n.type === 'agent');
      const endNodes = workflow.nodes.filter(n => n.type === 'end');
      
      expect(startNodes).toHaveLength(1);
      expect(agentNodes).toHaveLength(2);
      expect(endNodes).toHaveLength(1);

      // Act - Execute workflow
      const executionContext: Partial<WorkflowExecutionContext> = {
        expeditionId,
        userId: 'test-user',
        expeditionState: {},
        services: {
          agentService: {}, // Mock agent service
          userPromptService: userPromptHandler,
          dataService: {}
        }
      };

      const runtimeState = await workflowExecutionService.executeWorkflow(workflow, executionContext);

      // Assert - Workflow execution
      expect(runtimeState.status).toBe('completed');
      expect(runtimeState.executionResults.size).toBeGreaterThan(0);
      expect(runtimeState.error).toBeUndefined();
      
      // Validate all agent nodes executed successfully
      agentNodes.forEach(node => {
        const result = runtimeState.executionResults.get(node.id);
        expect(result).toBeDefined();
        expect(result?.success).toBe(true);
      });
    }, 30000);

    test('should handle workflow with output generation', async () => {
      // Create a workflow with explicit output node
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Begin Processing',
            description: 'Start workflow execution',
            parameters: {}
          },
          {
            id: 'agent-1',
            type: 'agent',
            name: 'Data Agent',
            description: 'Process data',
            parameters: {
              agentId: 'test-agent',
              taskIds: ['task-1']
            } as AgentNodeParameters
          },
          {
            id: 'output-1',
            type: 'output',
            name: 'Generate Report',
            description: 'Create final output',
            parameters: {
              template: 'report',
              sources: ['agent-1'],
              format: 'markdown'
            }
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'Complete',
            description: 'Workflow completed',
            parameters: {}
          }
        ],
        edges: [
          { id: 'e1', from: 'start-1', to: 'agent-1' },
          { id: 'e2', from: 'agent-1', to: 'output-1' },
          { id: 'e3', from: 'output-1', to: 'end-1' }
        ],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      const runtimeState = await workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'test-user'
      });

      expect(runtimeState.status).toBe('completed');
      expect(runtimeState.executionResults.size).toBe(3); // agent + output + end
    }, 20000);
  });

  describe('6.1.2 Complex Workflows with Conditionals', () => {
    test('should execute workflow with conditional branching', async () => {
      // Create workflow with conditional logic
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Start Quality Check',
            description: 'Begin quality assessment workflow',
            parameters: {}
          },
          {
            id: 'agent-1',
            type: 'agent',
            name: 'Quality Analyzer',
            description: 'Analyze data quality',
            parameters: {
              agentId: 'quality-agent',
              taskIds: ['quality-check']
            } as AgentNodeParameters
          },
          {
            id: 'conditional-1',
            type: 'conditional',
            name: 'Quality Gate',
            description: 'Route based on quality score',
            parameters: {
              sourceNodeId: 'agent-1',
              expression: 'results.qualityScore',
              conditions: {
                'high_quality': 'result >= 80',
                'low_quality': 'result < 80'
              },
              defaultCondition: 'low_quality'
            } as ConditionalNodeParameters
          },
          {
            id: 'agent-2',
            type: 'agent', 
            name: 'Approve High Quality',
            description: 'Process high quality data',
            parameters: {
              agentId: 'approval-agent',
              taskIds: ['approve-data']
            } as AgentNodeParameters
          },
          {
            id: 'agent-3',
            type: 'agent',
            name: 'Fix Low Quality',
            description: 'Fix low quality data',
            parameters: {
              agentId: 'fix-agent',
              taskIds: ['fix-data']
            } as AgentNodeParameters
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'Complete',
            description: 'Workflow completed',
            parameters: {}
          }
        ],
        edges: [
          { id: 'e1', from: 'start-1', to: 'agent-1' },
          { id: 'e2', from: 'agent-1', to: 'conditional-1' },
          { id: 'e3', from: 'conditional-1', to: 'agent-2', condition: 'high_quality' },
          { id: 'e4', from: 'conditional-1', to: 'agent-3', condition: 'low_quality' },
          { id: 'e5', from: 'agent-2', to: 'end-1' },
          { id: 'e6', from: 'agent-3', to: 'end-1' }
        ],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      // Mock agent-1 to return quality score data
      const mockExecutionContext: Partial<WorkflowExecutionContext> = {
        expeditionId: workflow.expeditionId,
        userId: 'test-user',
        services: {
          agentService: {},
          userPromptService: userPromptHandler,
          dataService: {}
        }
      };

      const runtimeState = await workflowExecutionService.executeWorkflow(workflow, mockExecutionContext);

      expect(runtimeState.status).toBe('completed');
      expect(runtimeState.executionResults.size).toBeGreaterThan(2);
      
      // Verify conditional logic executed
      const conditionalResult = runtimeState.executionResults.get('conditional-1');
      expect(conditionalResult).toBeDefined();
      expect(conditionalResult?.success).toBe(true);
      expect(conditionalResult?.nextEdgeCondition).toBeDefined();
    }, 25000);

    test('should handle complex JSONata expressions in conditionals', async () => {
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Start Analysis',
            description: 'Begin complex analysis',
            parameters: {}
          },
          {
            id: 'agent-1',
            type: 'agent',
            name: 'Data Analyzer',
            description: 'Analyze complex data',
            parameters: {
              agentId: 'analyzer-agent',
              taskIds: ['analyze-data']
            } as AgentNodeParameters
          },
          {
            id: 'conditional-1',
            type: 'conditional',
            name: 'Complex Decision Point',
            description: 'Make decision based on multiple criteria',
            parameters: {
              sourceNodeId: 'agent-1',
              expression: '{ "score": results.score, "errors": $count(results.errors), "confidence": results.confidence }',
              conditions: {
                'excellent': 'result.score >= 90 and result.errors = 0 and result.confidence > 0.95',
                'good': 'result.score >= 70 and result.errors <= 2',
                'poor': 'result.score < 70 or result.errors > 2'
              },
              defaultCondition: 'poor'
            } as ConditionalNodeParameters
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'Complete',
            description: 'Analysis completed',
            parameters: {}
          }
        ],
        edges: [
          { id: 'e1', from: 'start-1', to: 'agent-1' },
          { id: 'e2', from: 'agent-1', to: 'conditional-1' },
          { id: 'e3', from: 'conditional-1', to: 'end-1' }
        ],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      const runtimeState = await workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'test-user'
      });

      expect(runtimeState.status).toBe('completed');
      
      const conditionalResult = runtimeState.executionResults.get('conditional-1');
      expect(conditionalResult).toBeDefined();
      expect(conditionalResult?.success).toBe(true);
      expect(['excellent', 'good', 'poor']).toContain(conditionalResult?.nextEdgeCondition);
    }, 20000);
  });

  describe('6.1.3 User Prompt Interaction Tests', () => {
    test('should handle user prompt workflow with structured choices', async () => {
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Start Review',
            description: 'Begin review process',
            parameters: {}
          },
          {
            id: 'agent-1',
            type: 'agent',
            name: 'Initial Analysis',
            description: 'Perform initial analysis',
            parameters: {
              agentId: 'analysis-agent',
              taskIds: ['initial-analysis']
            } as AgentNodeParameters
          },
          {
            id: 'user-prompt-1',
            type: 'user_prompt',
            name: 'Review Required',
            description: 'User review and decision',
            parameters: {
              promptText: 'Please review the analysis results. What action would you like to take?',
              choices: [
                { id: 'approve', text: 'Approve Results', value: 'approved' },
                { id: 'revise', text: 'Request Revisions', value: 'revision_needed' },
                { id: 'reject', text: 'Reject Results', value: 'rejected' }
              ],
              sourceNodeId: 'agent-1',
              timeout: 5 // 5 minutes for test
            } as UserPromptNodeParameters
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'Complete',
            description: 'Review completed',
            parameters: {}
          }
        ],
        edges: [
          { id: 'e1', from: 'start-1', to: 'agent-1' },
          { id: 'e2', from: 'agent-1', to: 'user-prompt-1' },
          { id: 'e3', from: 'user-prompt-1', to: 'end-1' }
        ],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      // Start workflow execution asynchronously
      const executionPromise = workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'test-user'
      });

      // Wait a bit for user prompt to be created
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Find and respond to the user prompt
      const pendingPrompts = userPromptHandler.getPendingPromptsForExpedition(workflow.expeditionId);
      expect(pendingPrompts).toHaveLength(1);

      const prompt = pendingPrompts[0];
      expect(prompt.promptText).toContain('Please review the analysis results');
      
      // Simulate user response
      const responseResult = userPromptHandler.respondToPrompt(prompt.id, 'approve', 'test-user');
      expect(responseResult).toBe(true);

      // Wait for workflow completion
      const runtimeState = await executionPromise;

      expect(runtimeState.status).toBe('completed');
      
      const promptResult = runtimeState.executionResults.get('user-prompt-1');
      expect(promptResult).toBeDefined();
      expect(promptResult?.success).toBe(true);
      expect(promptResult?.data.userChoice).toBe('approve');
    }, 30000);

    test('should handle user prompt timeout correctly', async () => {
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Start',
            description: 'Start workflow',
            parameters: {}
          },
          {
            id: 'user-prompt-1',
            type: 'user_prompt',
            name: 'Quick Decision',
            description: 'Make a quick decision',
            parameters: {
              promptText: 'Quick decision needed!',
              choices: [
                { id: 'yes', text: 'Yes', value: true },
                { id: 'no', text: 'No', value: false }
              ],
              timeout: 0.01 // Very short timeout (0.6 seconds) for test
            } as UserPromptNodeParameters
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'Complete',
            description: 'Workflow completed',
            parameters: {}
          }
        ],
        edges: [
          { id: 'e1', from: 'start-1', to: 'user-prompt-1' },
          { id: 'e2', from: 'user-prompt-1', to: 'end-1' }
        ],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      const runtimeState = await workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'test-user'
      });

      expect(runtimeState.status).toBe('failed');
      
      const promptResult = runtimeState.executionResults.get('user-prompt-1');
      expect(promptResult).toBeDefined();
      expect(promptResult?.success).toBe(false);
      expect(promptResult?.error).toContain('timeout');
    }, 15000);
  });

  describe('6.1.4 Error Scenarios and Recovery', () => {
    test('should handle missing agent gracefully', async () => {
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Start',
            description: 'Start workflow',
            parameters: {}
          },
          {
            id: 'agent-1',
            type: 'agent',
            name: 'Missing Agent',
            description: 'Agent that does not exist',
            parameters: {
              agentId: 'non-existent-agent-id-12345',
              taskIds: ['some-task']
            } as AgentNodeParameters
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'Complete',
            description: 'Workflow completed',
            parameters: {}
          }
        ],
        edges: [
          { id: 'e1', from: 'start-1', to: 'agent-1' },
          { id: 'e2', from: 'agent-1', to: 'end-1' }
        ],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      const runtimeState = await workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'test-user'
      });

      expect(runtimeState.status).toBe('failed');
      
      const agentResult = runtimeState.executionResults.get('agent-1');
      expect(agentResult).toBeDefined();
      expect(agentResult?.success).toBe(false);
      expect(agentResult?.error).toContain('Agent not found');
    }, 15000);

    test('should handle invalid JSONata expressions', async () => {
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Start',
            description: 'Start workflow',
            parameters: {}
          },
          {
            id: 'agent-1',
            type: 'agent',
            name: 'Data Agent',
            description: 'Generate test data',
            parameters: {
              agentId: 'test-agent',
              taskIds: ['generate-data']
            } as AgentNodeParameters
          },
          {
            id: 'conditional-1',
            type: 'conditional',
            name: 'Invalid Conditional',
            description: 'Conditional with invalid JSONata',
            parameters: {
              sourceNodeId: 'agent-1',
              expression: '{{{{ invalid JSONata expression }}}}',
              conditions: {
                'default': 'true'
              }
            } as ConditionalNodeParameters
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'Complete',
            description: 'Workflow completed',
            parameters: {}
          }
        ],
        edges: [
          { id: 'e1', from: 'start-1', to: 'agent-1' },
          { id: 'e2', from: 'agent-1', to: 'conditional-1' },
          { id: 'e3', from: 'conditional-1', to: 'end-1' }
        ],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      const runtimeState = await workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'test-user'
      });

      expect(runtimeState.status).toBe('failed');
      
      const conditionalResult = runtimeState.executionResults.get('conditional-1');
      expect(conditionalResult).toBeDefined();
      expect(conditionalResult?.success).toBe(false);
      expect(conditionalResult?.error).toContain('expression');
    }, 15000);

    test('should handle workflow without start node', async () => {
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'agent-1',
            type: 'agent',
            name: 'Orphaned Agent',
            description: 'Agent without start node',
            parameters: {
              agentId: 'test-agent',
              taskIds: ['some-task']
            } as AgentNodeParameters
          }
        ],
        edges: [],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      await expect(
        workflowExecutionService.executeWorkflow(workflow, {
          expeditionId: workflow.expeditionId,
          userId: 'test-user'
        })
      ).rejects.toThrow('start node');
    }, 10000);
  });

  describe('6.1.5 Complex Integration Scenarios', () => {
    test('should execute workflow with all node types', async () => {
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Start Complex Workflow',
            description: 'Begin comprehensive workflow',
            parameters: {}
          },
          {
            id: 'agent-1',
            type: 'agent',
            name: 'Data Collector',
            description: 'Collect initial data',
            parameters: {
              agentId: 'collector-agent',
              taskIds: ['collect-data']
            } as AgentNodeParameters
          },
          {
            id: 'conditional-1',
            type: 'conditional',
            name: 'Data Quality Check',
            description: 'Check if collected data is sufficient',
            parameters: {
              sourceNodeId: 'agent-1',
              expression: 'results.dataCount',
              conditions: {
                'sufficient': 'result >= 100',
                'insufficient': 'result < 100'
              },
              defaultCondition: 'insufficient'
            } as ConditionalNodeParameters
          },
          {
            id: 'user-prompt-1',
            type: 'user_prompt',
            name: 'Manual Review',
            description: 'User review for insufficient data',
            parameters: {
              promptText: 'Data collection returned insufficient results. How should we proceed?',
              choices: [
                { id: 'proceed', text: 'Proceed Anyway', value: 'proceed' },
                { id: 'collect_more', text: 'Collect More Data', value: 'retry' }
              ],
              sourceNodeId: 'conditional-1',
              timeout: 10
            } as UserPromptNodeParameters
          },
          {
            id: 'agent-2',
            type: 'agent',
            name: 'Data Processor',
            description: 'Process the collected data',
            parameters: {
              agentId: 'processor-agent',
              taskIds: ['process-data']
            } as AgentNodeParameters
          },
          {
            id: 'output-1',
            type: 'output',
            name: 'Generate Results',
            description: 'Create final output',
            parameters: {
              template: 'comprehensive-report',
              sources: ['agent-1', 'agent-2'],
              format: 'json'
            }
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'Complete Complex Workflow',
            description: 'Comprehensive workflow completed',
            parameters: {}
          }
        ],
        edges: [
          { id: 'e1', from: 'start-1', to: 'agent-1' },
          { id: 'e2', from: 'agent-1', to: 'conditional-1' },
          { id: 'e3', from: 'conditional-1', to: 'agent-2', condition: 'sufficient' },
          { id: 'e4', from: 'conditional-1', to: 'user-prompt-1', condition: 'insufficient' },
          { id: 'e5', from: 'user-prompt-1', to: 'agent-2', condition: 'proceed' },
          { id: 'e6', from: 'agent-2', to: 'output-1' },
          { id: 'e7', from: 'output-1', to: 'end-1' }
        ],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      // Execute workflow with potential user interaction
      const executionPromise = workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'test-user'
      });

      // Check for user prompts after a delay
      setTimeout(async () => {
        const pendingPrompts = userPromptHandler.getPendingPromptsForExpedition(workflow.expeditionId);
        if (pendingPrompts.length > 0) {
          userPromptHandler.respondToPrompt(pendingPrompts[0].id, 'proceed', 'test-user');
        }
      }, 3000);

      const runtimeState = await executionPromise;

      expect(runtimeState.status).toBe('completed');
      expect(runtimeState.executionResults.size).toBeGreaterThan(4);
      
      // Verify key nodes executed
      expect(runtimeState.executionResults.get('agent-1')?.success).toBe(true);
      expect(runtimeState.executionResults.get('conditional-1')?.success).toBe(true);
      expect(runtimeState.executionResults.get('agent-2')?.success).toBe(true);
    }, 35000);
  });

  afterAll(async () => {
    // Clean up any resources
    console.log('Workflow DSL E2E tests completed');
  });
});