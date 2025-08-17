/**
 * MissionPlanParsingService - AI response parsing for mission plans
 * 
 * Handles parsing and validation of AI-generated mission plan responses.
 * Separated from orchestrator agent to follow separation of concerns pattern.
 */

import { MissionPlan, Agent } from '@starships/protocol';
import { MissionPlanService } from './MissionPlanService';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class MissionPlanParsingService {
  private static logger = Logger.getInstance();

  /**
   * Parse AI response and convert to MissionPlan
   * Moved from MissionOrchestratorAgent to follow separation of concerns
   */
  static parseAIResponse(aiResponse: string, missionId: string, agents: Agent[]): MissionPlan {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        throw new Error('Invalid task structure in AI response');
      }

      // Validate agent assignments
      const agentIds = agents.map(a => a.id);
      for (const task of parsed.tasks) {
        if (!agentIds.includes(task.assignedAgentId)) {
          throw new Error(`Invalid agent assignment: ${task.assignedAgentId}`);
        }
      }

      // Convert dependency indices to proper task structure
      const tasks = MissionPlanService.convertDependencyIndices(parsed.tasks);

      return {
        id: uuidv4(),
        missionId,
        tasks: tasks.map(task => ({ id: uuidv4(), ...task })),
        approvalStatus: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to parse AI plan response', {
        service: 'MissionPlanParsingService',
        operation: 'parseAIResponse',
        error: error instanceof Error ? error.message : String(error),
        response: aiResponse.substring(0, 500)
      });
      throw new Error('Failed to parse AI plan response');
    }
  }
}