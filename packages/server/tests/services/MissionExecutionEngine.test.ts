import { MissionExecutionEngine } from '../../src/services/MissionExecutionEngine';
import { MissionService } from '../../src/services/MissionService';
import { RepositoryFactory } from '@starships/models';
import { chatWithMCP } from '@starships/agent-engine';
import getStore from '../../src/store';
import type { 
  MissionWorkflow, 
  WorkflowNode, 
  MissionExecutionResult, 
  MissionNodeResult,
  ChatRequest,
  ChatResponse 
} from '@starships/protocol';

// Mock dependencies
jest.mock('../../src/services/MissionService');
jest.mock('@starships/models', () => ({
  RepositoryFactory: {
    getAgentRepository: jest.fn()
  }
}));
jest.mock('@starships/agent-engine', () => ({
  chatWithMCP: jest.fn(),
  LangChainMemoryStore: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    makeKey: jest.fn()
  }))
}));
jest.mock('../../src/store', () => jest.fn());
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

describe('MissionExecutionEngine', () => {
  let engine: MissionExecutionEngine;
  let mockMissionService: jest.Mocked<typeof MissionService>;
  let mockAgentRepo: any;
  let mockStore: any;
  let mockChatWithMCP: jest.MockedFunction<typeof chatWithMCP>;

  const mockMission = {
    id: 'mission-1',
    starshipId: 'starship-1',
    name: 'Test Mission',
    description: 'Test description',
    status: 'active' as const,
    phase: 'execute' as const,
    agentIds: ['agent-1'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'user-123',
    executionState: {
      status: 'running' as const,
      currentNodeIndex: 0,
      totalNodes: 0,
      nodeResults: [],
      startedAt: new Date().toISOString()
    }
  };

  const mockAgent = {
    id: 'agent-1',
    name: 'Test Agent',
    category: 'assistant',
    starshipId: 'starship-1',
    model: 'gpt-4'
  };

  const mockWorkflow: MissionWorkflow = {
    id: 'workflow-1',
    missionId: 'mission-1',
    approvalStatus: 'approved',
    createdAt: new Date().toISOString(),
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: 'Start',
        description: 'Start node',
        parameters: {}
      },
      {
        id: 'agent-node-1',
        type: 'agent',
        name: 'Agent Task 1',
        description: 'Execute first task',
        parameters: { agentId: 'agent-1' }
      },
      {
        id: 'agent-node-2',
        type: 'agent',
        name: 'Agent Task 2',
        description: 'Execute second task',
        parameters: { agentId: 'agent-1' }
      },
      {
        id: 'end',
        type: 'end',
        name: 'End',
        description: 'End node',
        parameters: {}
      }
    ],
    edges: []
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    mockMissionService = MissionService as jest.Mocked<typeof MissionService>;
    mockMissionService.getMissionById = jest.fn().mockResolvedValue(mockMission);
    mockMissionService.updateMission = jest.fn().mockResolvedValue(undefined);

    mockAgentRepo = {
      findById: jest.fn().mockResolvedValue(mockAgent)
    };
    (RepositoryFactory.getAgentRepository as jest.Mock).mockReturnValue(mockAgentRepo);

    mockStore = {
      initialize: jest.fn(),
      makeKey: jest.fn()
    };
    (getStore as jest.Mock).mockReturnValue(mockStore);

    mockChatWithMCP = chatWithMCP as jest.MockedFunction<typeof chatWithMCP>;
    
    engine = new MissionExecutionEngine();
  });

  describe('executeWorkflow', () => {
    it('should execute a single-node mission successfully', async () => {
      // Arrange
      const singleNodeWorkflow = {
        ...mockWorkflow,
        nodes: [
          mockWorkflow.nodes[0], // start
          mockWorkflow.nodes[1], // agent-node-1
          mockWorkflow.nodes[3]  // end
        ]
      };

      const mockResponse: ChatResponse = {
        reply: 'Task completed successfully',
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      };
      mockChatWithMCP.mockResolvedValue(mockResponse);

      // Act
      const result = await engine.executeWorkflow('mission-1', singleNodeWorkflow);

      // Assert
      expect(result.success).toBe(true);
      expect(result.nodeResults).toHaveLength(1);
      expect(result.nodeResults[0].success).toBe(true);
      expect(result.nodeResults[0].output).toBe('Task completed successfully');
      expect(mockChatWithMCP).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-1',
          user_id: 'user-123',
          message: expect.stringContaining('Execute first task')
        }),
        mockStore,
        { overrideStarshipId: 'starship-1' }
      );
    });

    it('should handle agent-not-found error', async () => {
      // Arrange
      mockAgentRepo.findById.mockResolvedValue(null);

      // Act
      const result = await engine.executeWorkflow('mission-1', mockWorkflow);

      // Assert
      expect(result.success).toBe(false);
      expect(result.nodeResults).toHaveLength(1);
      expect(result.nodeResults[0].success).toBe(false);
      expect(result.nodeResults[0].error).toContain('Agent not found: agent-1');
    });

    it('should retry on transient failures', async () => {
      // Arrange
      const rateLimitError = new Error('429: Too many requests');
      mockChatWithMCP
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue({
          reply: 'Task completed after retry',
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        });

      const singleNodeWorkflow = {
        ...mockWorkflow,
        nodes: [mockWorkflow.nodes[0], mockWorkflow.nodes[1], mockWorkflow.nodes[3]]
      };

      // Act
      const result = await engine.executeWorkflow('mission-1', singleNodeWorkflow);

      // Assert
      expect(result.success).toBe(true);
      expect(mockChatWithMCP).toHaveBeenCalledTimes(2);
      expect(result.nodeResults[0].output).toBe('Task completed after retry');
    });

    it('should stop execution on node failure after max retries', async () => {
      // Arrange
      const persistentError = new Error('500: Server error');
      mockChatWithMCP.mockRejectedValue(persistentError);

      const singleNodeWorkflow = {
        ...mockWorkflow,
        nodes: [mockWorkflow.nodes[0], mockWorkflow.nodes[1], mockWorkflow.nodes[3]]
      };

      // Act
      const result = await engine.executeWorkflow('mission-1', singleNodeWorkflow);

      // Assert
      expect(result.success).toBe(false);
      expect(mockChatWithMCP).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(result.nodeResults[0].success).toBe(false);
    });

    it('should update state after each node execution', async () => {
      // Arrange
      mockChatWithMCP.mockResolvedValue({
        reply: 'Task completed',
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      });

      // Act
      await engine.executeWorkflow('mission-1', mockWorkflow);

      // Assert
      expect(mockMissionService.updateMission).toHaveBeenCalledWith(
        'mission-1',
        expect.objectContaining({
          executionState: expect.objectContaining({
            currentNodeIndex: 1,
            nodeResults: expect.arrayContaining([
              expect.objectContaining({ success: true })
            ])
          })
        })
      );
    });

    it('should handle zero-agent-node mission', async () => {
      // Arrange
      const noAgentWorkflow = {
        ...mockWorkflow,
        nodes: [
          mockWorkflow.nodes[0], // start
          mockWorkflow.nodes[3]  // end
        ]
      };

      // Act
      const result = await engine.executeWorkflow('mission-1', noAgentWorkflow);

      // Assert
      expect(result.success).toBe(true);
      expect(result.nodeResults).toHaveLength(0);
      expect(result.summary).toContain('All completed successfully');
      expect(mockChatWithMCP).not.toHaveBeenCalled();
    });

    it('should execute multi-node workflow sequentially', async () => {
      // Arrange
      mockChatWithMCP
        .mockResolvedValueOnce({
          reply: 'First task completed',
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
        .mockResolvedValueOnce({
          reply: 'Second task completed',
          usage: { prompt_tokens: 120, completion_tokens: 60 }
        });

      // Act
      const result = await engine.executeWorkflow('mission-1', mockWorkflow);

      // Assert
      expect(result.success).toBe(true);
      expect(result.nodeResults).toHaveLength(2);
      expect(result.nodeResults[0].output).toBe('First task completed');
      expect(result.nodeResults[1].output).toBe('Second task completed');
      
      // Verify sequential execution
      expect(mockChatWithMCP).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          message: expect.stringContaining('Execute first task')
        }),
        mockStore,
        { overrideStarshipId: 'starship-1' }
      );
      expect(mockChatWithMCP).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          message: expect.stringContaining('Execute second task')
        }),
        mockStore,
        { overrideStarshipId: 'starship-1' }
      );
    });

    it('should handle mission without userId', async () => {
      // Arrange
      const missionWithoutUser = { ...mockMission, createdBy: '' };
      mockMissionService.getMissionById.mockResolvedValue(missionWithoutUser);

      // Act
      const result = await engine.executeWorkflow('mission-1', mockWorkflow);

      // Assert
      expect(result.success).toBe(false);
      expect(result.nodeResults[0].error).toContain('Mission has no associated user ID');
    });

    it('should use consistent memory store across nodes', async () => {
      // Arrange
      mockChatWithMCP.mockResolvedValue({
        reply: 'Task completed',
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      });

      // Act
      await engine.executeWorkflow('mission-1', mockWorkflow);

      // Assert
      // Verify same store instance is used for all calls
      expect(mockChatWithMCP).toHaveBeenCalledTimes(2);
      mockChatWithMCP.mock.calls.forEach(call => {
        expect(call[1]).toBe(mockStore);
      });
    });
  });

  describe('error handling and retry logic', () => {
    it('should retry on 429 rate limit errors', async () => {
      // Arrange
      const engine = new MissionExecutionEngine();
      const rateLimitError = new Error('429: Rate limit exceeded');
      
      mockChatWithMCP
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue({ reply: 'Success after retry', usage: undefined });

      const singleNodeWorkflow = {
        ...mockWorkflow,
        nodes: [mockWorkflow.nodes[0], mockWorkflow.nodes[1], mockWorkflow.nodes[3]]
      };

      // Act
      const result = await engine.executeWorkflow('mission-1', singleNodeWorkflow);

      // Assert
      expect(result.success).toBe(true);
      expect(mockChatWithMCP).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      // Arrange
      const nonRetryableError = new Error('Invalid API key');
      mockChatWithMCP.mockRejectedValue(nonRetryableError);

      const singleNodeWorkflow = {
        ...mockWorkflow,
        nodes: [mockWorkflow.nodes[0], mockWorkflow.nodes[1], mockWorkflow.nodes[3]]
      };

      // Act
      const result = await engine.executeWorkflow('mission-1', singleNodeWorkflow);

      // Assert
      expect(result.success).toBe(false);
      expect(mockChatWithMCP).toHaveBeenCalledTimes(1); // No retries
    });

    it('should include detailed error information in results', async () => {
      // Arrange
      const detailedError = new Error('Detailed agent execution error');
      detailedError.stack = 'Error stack trace...';
      mockChatWithMCP.mockRejectedValue(detailedError);

      const singleNodeWorkflow = {
        ...mockWorkflow,
        nodes: [mockWorkflow.nodes[0], mockWorkflow.nodes[1], mockWorkflow.nodes[3]]
      };

      // Act
      const result = await engine.executeWorkflow('mission-1', singleNodeWorkflow);

      // Assert
      expect(result.success).toBe(false);
      expect(result.nodeResults[0].error).toContain('Agent execution failed after 3 attempts');
      expect(result.nodeResults[0].error).toContain('Detailed agent execution error');
    });
  });
});