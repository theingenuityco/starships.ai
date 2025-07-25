import { getLogger, Logger } from '../utils/logger';
import { RepositoryFactory } from '@starships/models';
import { ExpeditionMessage } from '@starships/protocol';

// Import interfaces from VirtualFirstOfficer.ts
interface ExpeditionDetails {
  id: string;
<<<<<<< HEAD
  name: string;
  mission: string;
  status: string;
=======
  title: string;
  description: string;
  status: string;
  priority: string;
>>>>>>> e81f867dde987984d6cbc1f8eb53c61539cb4235
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata: Record<string, any>;
}

interface AgentContext {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'inactive' | 'busy';
  capabilities: string[];
  lastActive?: string;
  assignedTasks: string[];
  performance: {
    tasksCompleted: number;
    successRate: number;
    averageResponseTime: number;
  };
}

interface TaskSummary {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedAgent?: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  progress: number;
  subtasks: any[];
}

interface ExpeditionStatistics {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  failedTasks: number;
  totalMessages: number;
  averageCompletionTime: number;
  expeditionDuration: number;
  activeAgents: number;
  successRate: number;
}

export interface ExpeditionContext {
  expeditionDetails: ExpeditionDetails;
  agents: AgentContext[];
  taskSummaries: TaskSummary[];
  recentResults: any[];
  recentMessages: ExpeditionMessage[];
  statistics: ExpeditionStatistics;
  timestamp: string;
}

export class ContextBuilder {
  private logger: Logger;

  constructor() {
    this.logger = getLogger({ service: 'ContextBuilder' });
  }

  async buildExpeditionContext(expeditionId: string): Promise<ExpeditionContext> {
    // Fetch expedition to get starshipId
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const expedition = await expeditionRepo.findById(expeditionId);
    
    if (!expedition) {
      throw new Error(`Expedition ${expeditionId} not found`);
    }
    
    return this.buildContext(expeditionId, expedition.starshipId);
  }

  async buildContext(expeditionId: string, starshipId: string): Promise<ExpeditionContext> {
    this.logger.info('Building context for expedition', {
      service: 'ContextBuilder',
      operation: 'buildContext'
    }, {
      expeditionId,
      starshipId
    });

    try {
      // Fetch all data in parallel for better performance
      const [
        expeditionDetails,
        agents,
        tasks,
        results,
        messages
      ] = await Promise.all([
        this.fetchExpeditionDetails(expeditionId),
        this.fetchAgents(expeditionId, starshipId),
        this.fetchTasks(expeditionId),
        this.fetchRecentResults(expeditionId),
        this.fetchRecentMessages(expeditionId)
      ]);

      // Build task summaries with agent assignments
      const taskSummaries = await this.buildTaskSummaries(tasks, agents);

      // Calculate statistics
      const statistics = this.calculateStatistics(
        expeditionDetails,
        agents,
        taskSummaries,
        results,
        messages
      );

      const context: ExpeditionContext = {
        expeditionDetails,
        agents,
        taskSummaries,
        recentResults: results,
        recentMessages: messages,
        statistics,
        timestamp: new Date().toISOString()
      };

      this.logger.info('Context built successfully', {
        service: 'ContextBuilder',
        operation: 'buildContext'
      }, {
        expeditionId,
        agentCount: agents.length,
        taskCount: taskSummaries.length,
        resultCount: results.length,
        messageCount: messages.length
      });

      return context;
    } catch (error) {
      this.logger.error('Failed to build context', error instanceof Error ? error : new Error(String(error)), {
        service: 'ContextBuilder',
        operation: 'buildContext'
      }, {
        expeditionId
      });
      throw error;
    }
  }

  private async fetchExpeditionDetails(expeditionId: string): Promise<ExpeditionDetails> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw new Error(`Expedition not found: ${expeditionId}`);
      }

      return {
        id: expedition.id,
        name: expedition.name,
        mission: expedition.mission || '',
        status: expedition.status,
        createdAt: expedition.createdAt,
        updatedAt: expedition.updatedAt,
        startedAt: undefined, // Not available in Expedition model
        completedAt: undefined, // Not available in Expedition model
        metadata: {} // Not available in Expedition model
      };
    } catch (error) {
      this.logger.error('Failed to fetch expedition details', error instanceof Error ? error : new Error(String(error)), {
        service: 'ContextBuilder',
        operation: 'fetchExpeditionDetails'
      }, {
        expeditionId
      });
      throw error;
    }
  }

  private async fetchAgents(expeditionId: string, starshipId: string): Promise<AgentContext[]> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const agentRepo = RepositoryFactory.getAgentRepository();
      
      // Get expedition to find assigned agents
      const expedition = await expeditionRepo.findById(expeditionId);
      if (!expedition) {
        return [];
      }

      // Fetch detailed info for each assigned agent
      const agents: AgentContext[] = [];
      for (const agentId of (expedition.assignedAgents || [])) {
        try {
          const agent = await agentRepo.findById(agentId);
          if (agent) {
            // Get task assignments for this agent
            const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
            const allTasks = await taskRepo.findByExpedition(expeditionId);
            const agentTasks = allTasks.filter(task => task.assignedAgentId === agentId);
            
            agents.push({
              id: agent.id,
              name: agent.name,
              role: agent.category || 'general',
              status: 'active', // Assume active if in expedition
              capabilities: agent.tags || [],
              lastActive: undefined, // Not available in Agent model
              assignedTasks: agentTasks.map(t => t.id),
              performance: {
                tasksCompleted: agentTasks.filter(t => t.status === 'completed').length,
                successRate: agentTasks.length > 0 
                  ? (agentTasks.filter(t => t.status === 'completed').length / agentTasks.length) * 100 
                  : 0,
                averageResponseTime: 0 // Would be calculated from task completion times
              }
            });
          }
        } catch (agentError) {
          this.logger.warn('Failed to fetch agent details', {
            service: 'ContextBuilder',
            operation: 'fetchAgents'
          }, {
            expeditionId,
            agentId
          });
        }
      }
      
      return agents;
    } catch (error) {
      this.logger.error('Failed to fetch agents', error instanceof Error ? error : new Error(String(error)), {
        service: 'ContextBuilder',
        operation: 'fetchAgents'
      }, {
        expeditionId
      });
      // Return empty array if fetch fails to handle gracefully
      return [];
    }
  }

  private async fetchTasks(expeditionId: string): Promise<any[]> {
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const tasks = await taskRepo.findByExpedition(expeditionId);
      return tasks || [];
    } catch (error) {
      this.logger.error('Failed to fetch tasks', error instanceof Error ? error : new Error(String(error)), {
        service: 'ContextBuilder',
        operation: 'fetchTasks'
      }, {
        expeditionId
      });
      return [];
    }
  }

  private async buildTaskSummaries(tasks: any[], agents: AgentContext[]): Promise<TaskSummary[]> {
    const agentMap = new Map(agents.map(agent => [agent.id, agent]));
    
    return tasks.map(task => ({
      id: task.id,
      title: task.title || 'Untitled Task',
      status: task.status || 'pending',
      assignedAgent: task.assignedAgentId || undefined,
      priority: task.priority || 'medium',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt || undefined,
      progress: task.progress || 0,
      subtasks: task.subtasks || []
    }));
  }

  private async fetchRecentResults(expeditionId: string, limit: number = 10): Promise<any[]> {
    try {
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const results = await resultRepo.findByExpedition(expeditionId);
      
      // Sort by creation date and limit
      return results
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)
        .map(result => ({
          id: result.id,
          taskId: '', // Not available, would need to parse from result
          agentId: '', // Not available, would need to parse from result
          type: 'general',
          status: 'completed',
          data: {},
          createdAt: result.createdAt,
          metadata: result.metadata || {}
        }));
    } catch (error) {
      this.logger.error('Failed to fetch recent results', error instanceof Error ? error : new Error(String(error)), {
        service: 'ContextBuilder',
        operation: 'fetchRecentResults'
      }, {
        expeditionId
      });
      return [];
    }
  }

  private async fetchRecentMessages(expeditionId: string, limit: number = 20): Promise<ExpeditionMessage[]> {
    try {
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const messages = await messageRepo.findByExpedition(expeditionId);
      
      // Sort by creation date and get most recent messages
      return messages
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit)
        .reverse() // Reverse to get chronological order (oldest first)
        .map(msg => ({
          id: msg.id,
          expeditionId: msg.expeditionId,
          role: msg.role,
          agentId: msg.agentId,
          userId: msg.userId,
          content: msg.content,
          messageType: msg.messageType,
          timestamp: msg.timestamp,
          threadId: msg.threadId,
          parentMessageId: msg.parentMessageId,
          metadata: msg.metadata || {}
        }));
    } catch (error) {
      this.logger.error('Failed to fetch recent messages', error instanceof Error ? error : new Error(String(error)), {
        service: 'ContextBuilder',
        operation: 'fetchRecentMessages'
      }, {
        expeditionId
      });
      return [];
    }
  }

  private calculateStatistics(
    expeditionDetails: ExpeditionDetails,
    agents: AgentContext[],
    taskSummaries: TaskSummary[],
    results: any[],
    messages: ExpeditionMessage[]
  ): ExpeditionStatistics {
    // Count tasks by status
    const totalTasks = taskSummaries.length;
    const completedTasks = taskSummaries.filter(t => t.status === 'completed').length;
    const pendingTasks = taskSummaries.filter(t => t.status === 'pending').length;
    const inProgressTasks = taskSummaries.filter(t => t.status === 'in_progress').length;
    const failedTasks = taskSummaries.filter(t => t.status === 'failed').length;

    // Count active agents
    const activeAgents = agents.filter(a => a.status === 'active').length;

    // Calculate expedition duration
    const startTime = expeditionDetails.startedAt ? new Date(expeditionDetails.startedAt).getTime() : Date.now();
    const endTime = expeditionDetails.completedAt ? new Date(expeditionDetails.completedAt).getTime() : Date.now();
    const expeditionDuration = endTime - startTime;

    // Calculate average completion time for completed tasks
    const completedTasksWithTime = taskSummaries.filter(t => t.status === 'completed' && t.completedAt);
    let averageCompletionTime = 0;
    
    if (completedTasksWithTime.length > 0) {
      const totalCompletionTime = completedTasksWithTime.reduce((sum, task) => {
        const taskStartTime = new Date(task.createdAt).getTime();
        const taskEndTime = new Date(task.completedAt!).getTime();
        return sum + (taskEndTime - taskStartTime);
      }, 0);
      averageCompletionTime = totalCompletionTime / completedTasksWithTime.length;
    }

    // Calculate success rate
    const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      failedTasks,
      totalMessages: messages.length,
      averageCompletionTime,
      expeditionDuration,
      activeAgents,
      successRate
    };
  }
}