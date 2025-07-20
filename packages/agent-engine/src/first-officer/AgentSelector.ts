/**
 * Agent Selection Logic
 * 
 * Implements rule-based and LLM-enhanced agent selection for expedition tasks.
 * Combines keyword matching, skill assessment, and workload balancing.
 */

import { Agent, TaskBreakdown } from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { ProviderFactory } from '../llm/provider-factory';
import { buildPrompt } from '../prompt/builder';
import {
  AgentSelectionCriteria,
  AgentAssignment,
  AgentWorkload
} from './types';

export class AgentSelector {
  private starshipId: string;
  private availableAgents: Agent[] = [];
  private agentWorkloads: Map<string, AgentWorkload> = new Map();

  constructor(starshipId: string) {
    this.starshipId = starshipId;
  }

  /**
   * Initialize with available agents from the starship
   */
  async initialize(): Promise<void> {
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    this.availableAgents = await starshipRepo.getDeployedAgents(this.starshipId);
    
    // Initialize workload tracking
    for (const agent of this.availableAgents) {
      this.agentWorkloads.set(agent.id, {
        agentId: agent.id,
        currentTasks: 0,
        estimatedMinutes: 0,
        availability: 'available'
      });
    }
  }

  /**
   * Select optimal agents for expedition tasks
   */
  async selectAgents(
    tasks: TaskBreakdown[],
    criteria: AgentSelectionCriteria
  ): Promise<AgentAssignment[]> {
    if (this.availableAgents.length === 0) {
      await this.initialize();
    }

    // Phase 1: Rule-based filtering
    const candidateAgents = this.filterAgentsByRules(tasks, criteria);
    
    // Phase 2: LLM-enhanced selection and assignment
    const assignments = await this.optimizeAssignments(tasks, candidateAgents, criteria);
    
    // Phase 3: Workload balancing
    const balancedAssignments = this.balanceWorkload(assignments);
    
    // Update workload tracking
    this.updateWorkloadTracking(balancedAssignments);
    
    return balancedAssignments;
  }

  /**
   * Rule-based agent filtering using keyword matching and skill assessment
   */
  private filterAgentsByRules(
    tasks: TaskBreakdown[],
    criteria: AgentSelectionCriteria
  ): Agent[] {
    const allRequiredSkills = new Set<string>();
    tasks.forEach(task => {
      task.requiredSkills.forEach((skill: string) => allRequiredSkills.add(skill.toLowerCase()));
    });

    return this.availableAgents.filter(agent => {
      // Exclude explicitly excluded agents
      if (criteria.excludeAgents?.includes(agent.id)) {
        return false;
      }

      // Check availability
      const workload = this.agentWorkloads.get(agent.id);
      if (workload?.availability === 'overloaded') {
        return false;
      }

      // Skill matching using tags and category
      const agentSkills = [
        ...agent.tags.map(tag => tag.toLowerCase()),
        agent.category.toLowerCase()
      ];

      // Check if agent has any required skills
      const hasRequiredSkills = criteria.requiredSkills.some(skill =>
        agentSkills.some(agentSkill => 
          agentSkill.includes(skill.toLowerCase()) || 
          skill.toLowerCase().includes(agentSkill)
        )
      );

      return hasRequiredSkills;
    });
  }

  /**
   * LLM-enhanced agent selection and task assignment optimization
   */
  private async optimizeAssignments(
    tasks: TaskBreakdown[],
    candidateAgents: Agent[],
    criteria: AgentSelectionCriteria
  ): Promise<AgentAssignment[]> {
    if (candidateAgents.length === 0) {
      throw new Error('No suitable agents found for the given criteria');
    }

    // Create LLM prompt for agent selection
    const prompt = this.buildSelectionPrompt(tasks, candidateAgents, criteria);
    
    try {
      // Use a default agent for LLM calls (First Officer uses system LLM)
      const provider = await ProviderFactory.getProvider('first-officer-system');
      const result = await provider.complete(prompt);
      
      // Parse LLM response to extract assignments
      const assignments = this.parseAssignmentResponse(result.reply, candidateAgents);
      
      return assignments;
    } catch (error) {
      console.warn('LLM-enhanced selection failed, falling back to rule-based assignment:', error);
      return this.fallbackAssignment(tasks, candidateAgents);
    }
  }

  /**
   * Build LLM prompt for agent selection
   */
  private buildSelectionPrompt(
    tasks: TaskBreakdown[],
    agents: Agent[],
    criteria: AgentSelectionCriteria
  ) {
    const systemPrompt = `You are the First Officer's agent selection system. Your task is to optimally assign agents to expedition tasks based on their skills, workload, and task requirements.

ASSIGNMENT RULES:
1. Match agent skills to task requirements as closely as possible
2. Balance workload across agents when possible
3. Consider task dependencies and parallel execution opportunities
4. Provide clear reasoning for each assignment

RESPONSE FORMAT:
Return a JSON array of assignments in this exact format:
[
  {
    "agentId": "agent-id",
    "agentName": "Agent Name",
    "assignedTasks": ["task-id-1", "task-id-2"],
    "skillMatch": 0.85,
    "reasoning": "This agent is ideal because..."
  }
]`;

    const userMessage = `
TASKS TO ASSIGN:
${tasks.map(task => `
- Task ID: ${task.id}
- Description: ${task.description}
- Required Skills: ${task.requiredSkills.join(', ')}
- Dependencies: ${task.dependencies.join(', ') || 'None'}
- Estimated Effort: ${task.estimatedEffort || 'Unknown'} minutes
`).join('\n')}

AVAILABLE AGENTS:
${agents.map(agent => `
- Agent ID: ${agent.id}
- Name: ${agent.name}
- Category: ${agent.category}
- Skills/Tags: ${agent.tags.join(', ')}
- Current Workload: ${this.agentWorkloads.get(agent.id)?.estimatedMinutes || 0} minutes
`).join('\n')}

SELECTION CRITERIA:
- Required Skills: ${criteria.requiredSkills.join(', ')}
- Preferred Skills: ${criteria.preferredSkills?.join(', ') || 'None'}
- Max Agents: ${criteria.maxAgents || 'No limit'}
- Balance Workload: ${criteria.workloadBalance ? 'Yes' : 'No'}

Please provide optimal agent assignments with reasoning.`;

    return buildPrompt(systemPrompt, [], userMessage);
  }

  /**
   * Parse LLM response to extract agent assignments
   */
  private parseAssignmentResponse(response: string, agents: Agent[]): AgentAssignment[] {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const assignments = JSON.parse(jsonMatch[0]) as AgentAssignment[];
      
      // Validate and sanitize assignments
      return assignments.filter(assignment => {
        const agent = agents.find(a => a.id === assignment.agentId);
        return agent && assignment.assignedTasks && assignment.assignedTasks.length > 0;
      }).map(assignment => ({
        ...assignment,
        skillMatch: Math.max(0, Math.min(1, assignment.skillMatch || 0.5)),
        workload: assignment.assignedTasks.length * 30 // Default 30 min per task
      }));
    } catch (error) {
      console.warn('Failed to parse LLM assignment response:', error);
      throw new Error('Invalid assignment response format');
    }
  }

  /**
   * Fallback assignment using simple rule-based approach
   */
  private fallbackAssignment(tasks: TaskBreakdown[], agents: Agent[]): AgentAssignment[] {
    const assignments: AgentAssignment[] = [];
    const agentTaskCounts = new Map<string, number>();

    // Initialize agent task counts
    agents.forEach(agent => agentTaskCounts.set(agent.id, 0));

    // Assign tasks to agents with best skill match and lowest workload
    for (const task of tasks) {
      let bestAgent: Agent | null = null;
      let bestScore = -1;

      for (const agent of agents) {
        const skillScore = this.calculateSkillMatch(agent, task.requiredSkills);
        const workloadPenalty = (agentTaskCounts.get(agent.id) || 0) * 0.1;
        const totalScore = skillScore - workloadPenalty;

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestAgent = agent;
        }
      }

      if (bestAgent) {
        // Find existing assignment or create new one
        let assignment = assignments.find(a => a.agentId === bestAgent!.id);
        if (!assignment) {
          assignment = {
            agentId: bestAgent.id,
            agentName: bestAgent.name,
            assignedTasks: [],
            skillMatch: bestScore,
            workload: 0,
            reasoning: `Assigned based on skill match (${Math.round(bestScore * 100)}%) and workload balance`
          };
          assignments.push(assignment);
        }

        assignment.assignedTasks.push(task.id);
        assignment.workload += task.estimatedEffort || 30;
        agentTaskCounts.set(bestAgent.id, (agentTaskCounts.get(bestAgent.id) || 0) + 1);
      }
    }

    return assignments;
  }

  /**
   * Calculate skill match score between agent and required skills
   */
  private calculateSkillMatch(agent: Agent, requiredSkills: string[]): number {
    const agentSkills = [
      ...agent.tags.map(tag => tag.toLowerCase()),
      agent.category.toLowerCase()
    ];

    let matchCount = 0;
    for (const requiredSkill of requiredSkills) {
      const skillLower = requiredSkill.toLowerCase();
      const hasSkill = agentSkills.some(agentSkill =>
        agentSkill.includes(skillLower) || skillLower.includes(agentSkill)
      );
      if (hasSkill) matchCount++;
    }

    return requiredSkills.length > 0 ? matchCount / requiredSkills.length : 0;
  }

  /**
   * Balance workload across selected agents
   */
  private balanceWorkload(assignments: AgentAssignment[]): AgentAssignment[] {
    // Sort assignments by workload (descending)
    assignments.sort((a, b) => b.workload - a.workload);

    // Redistribute tasks if workload is heavily imbalanced
    const avgWorkload = assignments.reduce((sum, a) => sum + a.workload, 0) / assignments.length;
    const maxWorkload = avgWorkload * 1.5; // Allow 50% above average

    for (const assignment of assignments) {
      if (assignment.workload > maxWorkload && assignments.length > 1) {
        // Find agent with lowest workload to redistribute to
        const lightestAgent = assignments.reduce((min, current) => 
          current.workload < min.workload ? current : min
        );

        if (lightestAgent !== assignment && assignment.assignedTasks.length > 1) {
          // Move one task to the lightest agent
          const taskToMove = assignment.assignedTasks.pop()!;
          lightestAgent.assignedTasks.push(taskToMove);
          
          const taskWorkload = assignment.workload / (assignment.assignedTasks.length + 1);
          assignment.workload -= taskWorkload;
          lightestAgent.workload += taskWorkload;
        }
      }
    }

    return assignments;
  }

  /**
   * Update workload tracking for assigned agents
   */
  private updateWorkloadTracking(assignments: AgentAssignment[]): void {
    for (const assignment of assignments) {
      const workload = this.agentWorkloads.get(assignment.agentId);
      if (workload) {
        workload.currentTasks = assignment.assignedTasks.length;
        workload.estimatedMinutes += assignment.workload;
        workload.availability = assignment.workload > 120 ? 'busy' : 
                               assignment.workload > 240 ? 'overloaded' : 'available';
        workload.lastActivity = new Date().toISOString();
      }
    }
  }

  /**
   * Get current agent workloads
   */
  getAgentWorkloads(): AgentWorkload[] {
    return Array.from(this.agentWorkloads.values());
  }

  /**
   * Reset workload tracking (call when expedition completes)
   */
  resetWorkloads(): void {
    for (const [agentId, workload] of this.agentWorkloads) {
      workload.currentTasks = 0;
      workload.estimatedMinutes = 0;
      workload.availability = 'available';
    }
  }
}