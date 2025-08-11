/**
 * Agent Coordination Service
 * 
 * Handles agent assignment, communication, and coordination within expeditions.
 * Manages the relationship between agents and expeditions/tasks.
 */

import {
  Agent,
  Expedition,
} from '@starships/protocol';

import {
  ExpeditionError,
  ErrorFactory,
} from '@starships/protocol/src/types/error-classes';

import { Logger } from '../utils/logger';
import { RepositoryFactory } from '@starships/models';

export class AgentCoordinationService {
  private static instance: AgentCoordinationService;
  private logger = Logger.getInstance();

  private constructor() {}

  static getInstance(): AgentCoordinationService {
    if (!AgentCoordinationService.instance) {
      AgentCoordinationService.instance = new AgentCoordinationService();
    }
    return AgentCoordinationService.instance;
  }

  /**
   * Get information about assigned agents
   */
  async getAssignedAgentsInfo(agentIds: string[]): Promise<Array<{
    id: string;
    name: string;
    category: string;
    tags: string[];
  }>> {
    try {
      if (agentIds.length === 0) return [];

      const agentRepo = RepositoryFactory.getAgentRepository();
      const agents = await Promise.all(agentIds.map((id) => agentRepo.findById(id)));

      return agents
        .filter((agent) => agent !== null)
        .map((agent) => ({
          id: agent!.id,
          name: agent!.name,
          category: agent!.category,
          tags: agent!.tags,
        }));
    } catch (error) {
      console.error('[AGENT-COORDINATION] Failed to get assigned agents info:', error);
      throw this.handleError(error, 'GET_AGENTS_INFO_FAILED');
    }
  }

  /**
   * Validate that selected agents belong to the starship and are available
   */
  async validateSelectedAgents(starshipId: string, selectedAgents: string[]): Promise<void> {
    if (!selectedAgents || selectedAgents.length === 0) {
      return; // No agents to validate
    }

    try {
      const agentRepo = RepositoryFactory.getAgentRepository();
      
      // Validate each selected agent
      for (const agentId of selectedAgents) {
        const agent = await agentRepo.findById(agentId);
        
        if (!agent) {
          throw this.createError('AGENT_NOT_AVAILABLE', `Agent not found: ${agentId}`);
        }
        
        // Check if agent belongs to the starship
        if (agent.starshipId !== starshipId) {
          throw this.createError('AGENT_NOT_AVAILABLE', `Agent ${agentId} does not belong to starship ${starshipId}`);
        }
        
        // Agent is available if it exists and belongs to the starship
        // No additional status check needed since agents are either deployed on a starship or not
      }
      
      console.log(`[AGENT-COORDINATION] All selected agents validated successfully for starship: ${starshipId}`);
    } catch (error) {
      console.error('[AGENT-COORDINATION] Failed to validate selected agents:', error);
      throw this.handleError(error, 'VALIDATE_AGENTS_FAILED');
    }
  }

  /**
   * Assign an agent to an expedition
   */
  async assignAgentToExpedition(expeditionId: string, agentId: string): Promise<boolean> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      return await expeditionRepo.assignAgent(expeditionId, agentId);
    } catch (error) {
      console.error('[AGENT-COORDINATION] Failed to assign agent to expedition:', error);
      throw this.handleError(error, 'ASSIGN_AGENT_FAILED');
    }
  }

  /**
   * Remove an agent from an expedition
   */
  async removeAgentFromExpedition(expeditionId: string, agentId: string): Promise<boolean> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      return await expeditionRepo.removeAgent(expeditionId, agentId);
    } catch (error) {
      console.error('[AGENT-COORDINATION] Failed to remove agent from expedition:', error);
      throw this.handleError(error, 'REMOVE_AGENT_FAILED');
    }
  }

  /**
   * Get all agents assigned to an expedition
   */
  async getExpeditionAgents(expeditionId: string): Promise<Agent[]> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      return await expeditionRepo.getAssignedAgents(expeditionId);
    } catch (error) {
      console.error('[AGENT-COORDINATION] Failed to get expedition agents:', error);
      throw this.handleError(error, 'GET_EXPEDITION_AGENTS_FAILED');
    }
  }

  /**
   * Get agent availability for a starship
   */
  async getAvailableAgents(starshipId: string): Promise<Agent[]> {
    try {
      const agentRepo = RepositoryFactory.getAgentRepository();
      return await agentRepo.findByStarship(starshipId);
    } catch (error) {
      console.error('[AGENT-COORDINATION] Failed to get available agents:', error);
      throw this.handleError(error, 'GET_AVAILABLE_AGENTS_FAILED');
    }
  }

  /**
   * Check agent workload across expeditions
   */
  async getAgentWorkload(agentId: string): Promise<{
    activeExpeditions: number;
    pendingTasks: number;
    inProgressTasks: number;
    workloadLevel: 'low' | 'medium' | 'high';
  }> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();

      // Get active expeditions for this agent
      const allExpeditions = await expeditionRepo.findAll();
      const activeExpeditions = allExpeditions.filter(exp => 
        exp.assignedAgents.includes(agentId) && 
        ['planning', 'in-progress'].includes(exp.status)
      );

      // Get tasks assigned to this agent
      let pendingTasks = 0;
      let inProgressTasks = 0;

      for (const expedition of activeExpeditions) {
        const tasks = await taskRepo.findByExpedition(expedition.id);
        const agentTasks = tasks.filter(task => task.assignedAgentId === agentId);
        
        pendingTasks += agentTasks.filter(task => task.status === 'pending').length;
        inProgressTasks += agentTasks.filter(task => task.status === 'in-progress').length;
      }

      // Determine workload level
      const totalLoad = activeExpeditions.length + pendingTasks + inProgressTasks;
      let workloadLevel: 'low' | 'medium' | 'high' = 'low';
      
      if (totalLoad > 10) {
        workloadLevel = 'high';
      } else if (totalLoad > 5) {
        workloadLevel = 'medium';
      }

      return {
        activeExpeditions: activeExpeditions.length,
        pendingTasks,
        inProgressTasks,
        workloadLevel,
      };
    } catch (error) {
      console.error('[AGENT-COORDINATION] Failed to get agent workload:', error);
      throw this.handleError(error, 'GET_AGENT_WORKLOAD_FAILED');
    }
  }

  /**
   * Suggest optimal agent assignment for a task based on skills and workload
   */
  async suggestAgentForTask(
    starshipId: string,
    requiredSkills: string[],
    expeditionId?: string
  ): Promise<{
    recommendedAgent: Agent | null;
    alternatives: Agent[];
    reasoning: string;
  }> {
    try {
      const availableAgents = await this.getAvailableAgents(starshipId);
      
      if (availableAgents.length === 0) {
        return {
          recommendedAgent: null,
          alternatives: [],
          reasoning: 'No agents available for this starship',
        };
      }

      // Score agents based on skills match and workload
      const scoredAgents = await Promise.all(
        availableAgents.map(async (agent) => {
          const skillsMatch = this.calculateSkillsMatch(agent.tags, requiredSkills);
          const workload = await this.getAgentWorkload(agent.id);
          const workloadScore = this.calculateWorkloadScore(workload.workloadLevel);
          
          const totalScore = skillsMatch * 0.7 + workloadScore * 0.3;
          
          return {
            agent,
            score: totalScore,
            skillsMatch,
            workload: workload.workloadLevel,
          };
        })
      );

      // Sort by score (descending)
      scoredAgents.sort((a, b) => b.score - a.score);

      const recommendedAgent = scoredAgents[0]?.agent || null;
      const alternatives = scoredAgents.slice(1, 4).map(item => item.agent);
      
      const reasoning = recommendedAgent 
        ? `Agent ${recommendedAgent.name} selected based on ${Math.round(scoredAgents[0].skillsMatch * 100)}% skills match and ${scoredAgents[0].workload} workload`
        : 'No suitable agent found based on requirements';

      return {
        recommendedAgent,
        alternatives,
        reasoning,
      };
    } catch (error) {
      console.error('[AGENT-COORDINATION] Failed to suggest agent for task:', error);
      throw this.handleError(error, 'SUGGEST_AGENT_FAILED');
    }
  }

  // Private helper methods

  /**
   * Calculate how well agent skills match required skills (0-1 score)
   */
  private calculateSkillsMatch(agentSkills: string[], requiredSkills: string[]): number {
    if (requiredSkills.length === 0) return 1;
    
    const matchedSkills = requiredSkills.filter(skill => 
      agentSkills.some(agentSkill => 
        agentSkill.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(agentSkill.toLowerCase())
      )
    );

    return matchedSkills.length / requiredSkills.length;
  }

  /**
   * Convert workload level to score (0-1, higher is better)
   */
  private calculateWorkloadScore(workloadLevel: 'low' | 'medium' | 'high'): number {
    switch (workloadLevel) {
      case 'low': return 1.0;
      case 'medium': return 0.6;
      case 'high': return 0.2;
      default: return 0.5;
    }
  }

  private createError(code: string, message: string, expeditionId?: string): ExpeditionError {
    return ErrorFactory.expedition(code as any, message, expeditionId, {
      service: 'agent-coordination-service',
      operation: 'error_creation',
    });
  }

  private handleError(error: any, fallbackCode: string, expeditionId?: string): ExpeditionError {
    // If it's already a standard error, return as-is
    if (error.code) {
      return this.createError(error.code, error.message || 'Unknown error occurred', expeditionId);
    }

    // Create fallback error
    return ErrorFactory.expedition(
      fallbackCode as any,
      error.message || 'Unknown error occurred',
      expeditionId,
      {
        service: 'agent-coordination-service',
        operation: 'error_handling',
        metadata: { originalError: error.toString() },
      }
    );
  }
}