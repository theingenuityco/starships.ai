import { AgentExpeditionContextService } from '../../src/services/AgentExpeditionContextService';
import { RepositoryFactory } from '../../src/index';
import { Expedition, Agent, ExpeditionTask } from '../../src/types';

// Mock dependencies
jest.mock('../../src/index');

const mockExpeditionRepo = {
  findAll: jest.fn(),
};

const mockAgentRepo = {
  findById: jest.fn(),
};

const mockTaskRepo = {
  findByAgent: jest.fn(),
};

const mockRepositoryFactory = RepositoryFactory as jest.Mocked<typeof RepositoryFactory>;

describe('AgentExpeditionContextService', () => {
  let service: AgentExpeditionContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepositoryFactory.getExpeditionRepository.mockReturnValue(mockExpeditionRepo as any);
    mockRepositoryFactory.getAgentRepository.mockReturnValue(mockAgentRepo as any);
    mockRepositoryFactory.getExpeditionTaskRepository.mockReturnValue(mockTaskRepo as any);
    
    // Reset singleton instance
    (AgentExpeditionContextService as any).instance = undefined;
    service = AgentExpeditionContextService.getInstance();
  });

  afterEach(() => {
    // Reset singleton instance after each test
    (AgentExpeditionContextService as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = AgentExpeditionContextService.getInstance();
      const instance2 = AgentExpeditionContextService.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(AgentExpeditionContextService);
    });
  });

  describe('getAgentExpeditionContext', () => {
    const mockExpedition: Expedition = {
      id: 'expedition-1',
      name: 'Test Expedition',
      mission: 'Complete the test mission',
      status: 'planning',
      assignedAgents: ['agent-1', 'agent-2'],
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
      createdBy: 'user-1',
      starshipId: 'starship-1'
    };

    const mockAgent1: Agent = {
      id: 'agent-1',
      name: 'Test Agent 1',
      model: 'gpt-4',
      systemPrompt: 'Test prompt',
      category: 'general' as const,
      version: '1.0.0',
      isPublic: false,
      authorId: 'user-1',
      starshipId: 'starship-1',
      usageCount: 0,
      tags: ['test'],
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z'
    };

    const mockAgent2: Agent = {
      id: 'agent-2',
      name: 'Test Agent 2',
      model: 'gpt-4',
      systemPrompt: 'Test prompt',
      category: 'analysis' as const,
      version: '1.0.0',
      isPublic: false,
      authorId: 'user-1',
      starshipId: 'starship-1',
      usageCount: 0,
      tags: ['analysis'],
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z'
    };

    const mockTask: ExpeditionTask = {
      id: 'task-1',
      title: 'Test Task',
      description: 'Test task description',
      status: 'in-progress',
      priority: 'high',
      expeditionId: 'expedition-1',
      assignedAgentId: 'agent-1',
      requiredSkills: ['testing'],
      dependencies: [],
      deliverable: 'Test deliverable',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z'
    };

    it('should return expedition context for agent', async () => {
      mockExpeditionRepo.findAll.mockResolvedValue([mockExpedition]);
      mockAgentRepo.findById.mockImplementation((id: string) => {
        if (id === 'agent-1') return Promise.resolve(mockAgent1);
        if (id === 'agent-2') return Promise.resolve(mockAgent2);
        return Promise.resolve(null);
      });
      mockTaskRepo.findByAgent.mockResolvedValue([mockTask]);

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(mockExpeditionRepo.findAll).toHaveBeenCalled();
      expect(mockAgentRepo.findById).toHaveBeenCalledWith('agent-1');
      expect(mockAgentRepo.findById).toHaveBeenCalledWith('agent-2');
      expect(mockTaskRepo.findByAgent).toHaveBeenCalledWith('agent-1');

      expect(result).toContain('EXPEDITION CONTEXT');
      expect(result).toContain('Test Expedition');
      expect(result).toContain('Complete the test mission');
      expect(result).toContain('planning');
      expect(result).toContain('First Officer');
      expect(result).toContain('Test Agent 2 (analysis specialist)');
      expect(result).toContain('Test Task (in-progress, high priority)');
      expect(result).toContain('CRITICAL VISION-MISSION ALIGNMENT REQUIREMENT');
    });

    it('should return expedition context without mission', async () => {
      const expeditionWithoutMission = { ...mockExpedition, mission: undefined };
      mockExpeditionRepo.findAll.mockResolvedValue([expeditionWithoutMission]);
      mockAgentRepo.findById.mockImplementation((id: string) => {
        if (id === 'agent-1') return Promise.resolve(mockAgent1);
        return Promise.resolve(null);
      });
      mockTaskRepo.findByAgent.mockResolvedValue([]);

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(result).toContain('Test Expedition');
      expect(result).not.toContain('Mission Objective:');
      expect(result).toContain('Status: planning');
    });

    it('should handle single agent expedition', async () => {
      const singleAgentExpedition = { ...mockExpedition, assignedAgents: ['agent-1'] };
      mockExpeditionRepo.findAll.mockResolvedValue([singleAgentExpedition]);
      mockAgentRepo.findById.mockResolvedValue(mockAgent1);
      mockTaskRepo.findByAgent.mockResolvedValue([]);

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(result).toContain('Test Expedition');
      expect(result).not.toContain('Your team members');
    });

    it('should handle expedition with no active tasks', async () => {
      const completedTask = { ...mockTask, status: 'completed' as const };
      mockExpeditionRepo.findAll.mockResolvedValue([mockExpedition]);
      mockAgentRepo.findById.mockImplementation((id: string) => {
        if (id === 'agent-1') return Promise.resolve(mockAgent1);
        if (id === 'agent-2') return Promise.resolve(mockAgent2);
        return Promise.resolve(null);
      });
      mockTaskRepo.findByAgent.mockResolvedValue([completedTask]);

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(result).toContain('Test Expedition');
      expect(result).not.toContain('Your current tasks');
    });

    it('should return empty string when agent has no active expeditions', async () => {
      mockExpeditionRepo.findAll.mockResolvedValue([]);

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(result).toBe('');
    });

    it('should return empty string when agent is not assigned to any expedition', async () => {
      const otherExpedition = { ...mockExpedition, assignedAgents: ['other-agent'] };
      mockExpeditionRepo.findAll.mockResolvedValue([otherExpedition]);

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(result).toBe('');
    });

    it('should filter expeditions by status', async () => {
      const completedExpedition = { ...mockExpedition, status: 'completed' as const };
      const draftExpedition = { ...mockExpedition, id: 'expedition-2', status: 'draft' as const };
      
      mockExpeditionRepo.findAll.mockResolvedValue([completedExpedition, draftExpedition]);
      mockAgentRepo.findById.mockImplementation((id: string) => {
        if (id === 'agent-1') return Promise.resolve(mockAgent1);
        if (id === 'agent-2') return Promise.resolve(mockAgent2);
        return Promise.resolve(null);
      });
      mockTaskRepo.findByAgent.mockResolvedValue([]);

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(result).toContain('Test Expedition'); // Should use the draft expedition
      expect(result).toContain('Status: draft');
    });

    it('should handle repository errors gracefully', async () => {
      mockExpeditionRepo.findAll.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(result).toBe('');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AGENT-EXPEDITION-CONTEXT] Failed to get agent expedition context:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle missing agents gracefully', async () => {
      mockExpeditionRepo.findAll.mockResolvedValue([mockExpedition]);
      mockAgentRepo.findById.mockImplementation((id: string) => {
        if (id === 'agent-1') return Promise.resolve(mockAgent1);
        return Promise.resolve(null); // agent-2 not found
      });
      mockTaskRepo.findByAgent.mockResolvedValue([]);

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(result).toContain('Test Expedition');
      expect(result).not.toContain('Test Agent 2'); // Missing agent should be skipped
    });

    it('should filter tasks by expedition and status', async () => {
      const otherExpeditionTask = { ...mockTask, id: 'task-2', expeditionId: 'other-expedition' };
      const completedTask = { ...mockTask, id: 'task-3', status: 'completed' as const };
      const activeTask = { ...mockTask, id: 'task-4', status: 'assigned' as const, priority: 'medium' };

      mockExpeditionRepo.findAll.mockResolvedValue([mockExpedition]);
      mockAgentRepo.findById.mockResolvedValue(mockAgent1);
      mockTaskRepo.findByAgent.mockResolvedValue([mockTask, otherExpeditionTask, completedTask, activeTask]);

      const result = await service.getAgentExpeditionContext('agent-1');

      expect(result).toContain('Test Task (in-progress, high priority)');
      expect(result).toContain('Test Task (assigned, medium priority)'); // Using task title, not ID
      expect(result).not.toContain('other-expedition');
      expect(result).not.toContain('completed');
    });
  });

  describe('shouldMentionFirstOfficer', () => {
    it('should return true for manager-related keywords', () => {
      const testCases = [
        'Who is my manager?',
        'Can you tell me about my boss?',
        'Who is the supervisor here?',
        'Who leads this team?',
        'Who assigns tasks to me?',
        'Who manages this expedition?',
        'Who is in charge of the project?'
      ];

      testCases.forEach(message => {
        expect(service.shouldMentionFirstOfficer(message)).toBe(true);
      });
    });

    it('should return true for team-related keywords', () => {
      const testCases = [
        'Who are my team members?',
        'Who am I working with?',
        'Tell me about my colleagues',
        'What expedition am I on?',
        'What mission are we doing?'
      ];

      testCases.forEach(message => {
        expect(service.shouldMentionFirstOfficer(message)).toBe(true);
      });
    });

    it('should return false for unrelated messages', () => {
      const testCases = [
        'Hello, how are you?',
        'What is the weather today?',
        'Help me with this code',
        'Explain this concept to me',
        'What time is it?'
      ];

      testCases.forEach(message => {
        expect(service.shouldMentionFirstOfficer(message)).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      expect(service.shouldMentionFirstOfficer('WHO IS MY MANAGER?')).toBe(true);
      expect(service.shouldMentionFirstOfficer('who is my manager?')).toBe(true);
      expect(service.shouldMentionFirstOfficer('Who Is My Manager?')).toBe(true);
    });

    it('should match partial words', () => {
      expect(service.shouldMentionFirstOfficer('The expedition leader will help')).toBe(true);
      expect(service.shouldMentionFirstOfficer('Our team coordinator said...')).toBe(true);
    });
  });
});