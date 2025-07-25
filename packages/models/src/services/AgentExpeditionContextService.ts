import { RepositoryFactory } from '../index';
import { Expedition, Agent, ExpeditionTask } from '../types';

/**
 * Service to provide expedition context to agents during chat
 * This enables agents to be aware of their First Officer (manager) and team members
 */
export class AgentExpeditionContextService {
  private static instance: AgentExpeditionContextService;

  static getInstance(): AgentExpeditionContextService {
    if (!AgentExpeditionContextService.instance) {
      AgentExpeditionContextService.instance = new AgentExpeditionContextService();
    }
    return AgentExpeditionContextService.instance;
  }

  /**
   * Get expedition context for an agent
   * This provides information about the agent's current expedition, First Officer, and team
   */
  async getAgentExpeditionContext(agentId: string): Promise<string> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const agentRepo = RepositoryFactory.getAgentRepository();
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();

      // Find all expeditions this agent is assigned to
      const allExpeditions = await expeditionRepo.findAll();
      const agentExpeditions = allExpeditions.filter(exp => 
        exp.assignedAgents.includes(agentId) && 
        (exp.status === 'planning' || exp.status === 'review' || exp.status === 'draft' || exp.status === 'failed')
      );

      if (agentExpeditions.length === 0) {
        return '';
      }

      // Get the most recent active expedition
      const currentExpedition = agentExpeditions[0];

      // Get all agents in the expedition for team info
      const teamAgents: Agent[] = [];
      for (const teamAgentId of currentExpedition.assignedAgents) {
        const agent = await agentRepo.findById(teamAgentId);
        if (agent) {
          teamAgents.push(agent);
        }
      }

      // Get agent's assigned tasks
      const agentTasks = await taskRepo.findByAgent(agentId);
      const expeditionTasks = agentTasks.filter(task => task.expeditionId === currentExpedition.id);
      const activeTasks = expeditionTasks.filter(task => 
        task.status === 'in-progress' || task.status === 'assigned' || task.status === 'pending'
      );

      // Build context string
      let context = `\n\nEXPEDITION CONTEXT:\n`;
      context += `You are currently assigned to the expedition: "${currentExpedition.title}"\n`;
      context += `Your manager is the First Officer who coordinates this expedition.\n`;
      context += `The First Officer is responsible for:\n`;
      context += `- Assigning tasks to agents based on their expertise\n`;
      context += `- Providing guidance and clarification when needed\n`;
      context += `- Coordinating between team members\n`;
      context += `- Ensuring the expedition's objectives are met\n\n`;

      // Add team information
      if (teamAgents.length > 1) {
        context += `Your team members in this expedition:\n`;
        for (const teamAgent of teamAgents) {
          if (teamAgent.id !== agentId) {
            context += `- ${teamAgent.name} (${teamAgent.category || 'general'} specialist)\n`;
          }
        }
        context += `\n`;
      }

      // Add current tasks
      if (activeTasks.length > 0) {
        context += `Your current tasks:\n`;
        for (const task of activeTasks) {
          context += `- ${task.title} (${task.status}, ${task.priority} priority)\n`;
        }
        context += `\n`;
      }

      // Add bidirectional communication awareness
      context += `IMPORTANT: You can communicate with your First Officer manager at any time:\n`;
      context += `- Ask for clarification if requirements are unclear\n`;
      context += `- Report blockers if you encounter issues\n`;
      context += `- Request assistance from other team members\n`;
      context += `- Provide progress updates on your tasks\n`;
      context += `\nWhen asked about your manager, always refer to the First Officer who manages this expedition.\n`;
      context += `The First Officer is your direct manager who assigns tasks and provides guidance.\n`;

      return context;

    } catch (error) {
      console.error('[AGENT-EXPEDITION-CONTEXT] Failed to get agent expedition context:', error);
      // Don't block chat if context fails
      return '';
    }
  }

  /**
   * Check if agent should mention First Officer in response
   * Based on keywords in the user's message
   */
  shouldMentionFirstOfficer(userMessage: string): boolean {
    const keywords = [
      'manager', 'boss', 'supervisor', 'leader', 'coordinator',
      'who assigns', 'who manages', 'who leads', 'in charge',
      'team', 'members', 'colleagues', 'working with',
      'expedition', 'project', 'mission'
    ];

    const lowerMessage = userMessage.toLowerCase();
    return keywords.some(keyword => lowerMessage.includes(keyword));
  }
}

export default AgentExpeditionContextService;