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
  private preSelectedAgentIds?: string[];

  constructor(starshipId: string, preSelectedAgentIds: string[]) {
    this.starshipId = starshipId;
    
    // MANDATORY: Validate that agents are provided
    if (!preSelectedAgentIds || preSelectedAgentIds.length === 0) {
      throw new Error(
        'AgentSelector requires pre-selected agents. ' +
        'Auto-assignment has been removed - agents must be explicitly provided.'
      );
    }
    
    this.preSelectedAgentIds = preSelectedAgentIds;
    console.log(`🎯 [AGENT-SELECTOR] Initialized with ${preSelectedAgentIds.length} pre-selected agents:`, preSelectedAgentIds);
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
   * Select optimal agents for expedition tasks - ONLY WORKS WITH PRE-SELECTED AGENTS
   */
  async selectAgents(
    tasks: TaskBreakdown[],
    criteria: AgentSelectionCriteria
  ): Promise<AgentAssignment[]> {
    if (this.availableAgents.length === 0) {
      await this.initialize();
    }

    // MANDATORY: Only work with pre-selected agents - no auto-assignment
    if (!this.preSelectedAgentIds || this.preSelectedAgentIds.length === 0) {
      throw new Error(
        'AgentSelector.selectAgents() requires pre-selected agents. ' +
        'Auto-assignment has been removed - agents must be explicitly provided during expedition creation.'
      );
    }

    console.log(`🎯 [AGENT-SELECTOR] Using ONLY pre-selected agents - no auto-assignment fallback`);
    return await this.usePreSelectedAgents(tasks, criteria);
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
   * Use pre-selected agents ONLY - no fallback to automatic selection
   */
  private async usePreSelectedAgents(
    tasks: TaskBreakdown[],
    criteria: AgentSelectionCriteria
  ): Promise<AgentAssignment[]> {
    console.log(`🎯 [AGENT-SELECTOR] Using ONLY pre-selected agents: ${this.preSelectedAgentIds?.join(', ')}`);
    
    // Get pre-selected agents that are available
    const preSelectedAgents = this.availableAgents.filter(agent =>
      this.preSelectedAgentIds?.includes(agent.id)
    );
    
    if (preSelectedAgents.length === 0) {
      throw new Error(
        `No pre-selected agents are available on this starship. ` +
        `Selected agent IDs: ${this.preSelectedAgentIds?.join(', ')}. ` +
        `Auto-assignment has been removed - please select different agents.`
      );
    }
    
    // Check if pre-selected agents have required skills
    const skillCheckResults = this.validatePreSelectedAgentSkills(preSelectedAgents, tasks);
    
    if (!skillCheckResults.hasRequiredSkills) {
      console.warn(`⚠️ [AGENT-SELECTOR] Pre-selected agents lack some required skills: ${skillCheckResults.missingSkills.join(', ')}`);
      console.warn(`⚠️ [AGENT-SELECTOR] Proceeding with available agents - expedition may have reduced capability`);
    }
    
    // Use pre-selected agents for task assignment (no fallback)
    const assignments = await this.assignTasksToPreSelectedAgents(tasks, preSelectedAgents, criteria);
    this.updateWorkloadTracking(assignments);
    
    console.log(`✅ [AGENT-SELECTOR] Successfully assigned tasks to ${assignments.length} pre-selected agents (NO AUTO-ASSIGNMENT)`);
    return assignments;
  }

  /**
   * Validate that pre-selected agents have the required skills
   */
  private validatePreSelectedAgentSkills(
    preSelectedAgents: Agent[],
    tasks: TaskBreakdown[]
  ): { hasRequiredSkills: boolean; missingSkills: string[] } {
    const allRequiredSkills = new Set<string>();
    tasks.forEach(task => {
      task.requiredSkills.forEach(skill => allRequiredSkills.add(skill.toLowerCase()));
    });
    
    const availableSkills = new Set<string>();
    preSelectedAgents.forEach(agent => {
      agent.tags.forEach(tag => availableSkills.add(tag.toLowerCase()));
      availableSkills.add(agent.category.toLowerCase());
    });
    
    const missingSkills: string[] = [];
    for (const requiredSkill of allRequiredSkills) {
      const hasSkill = Array.from(availableSkills).some(availableSkill =>
        availableSkill.includes(requiredSkill) || requiredSkill.includes(availableSkill)
      );
      if (!hasSkill) {
        missingSkills.push(requiredSkill);
      }
    }
    
    return {
      hasRequiredSkills: missingSkills.length === 0,
      missingSkills
    };
  }

  /**
   * Assign tasks to pre-selected agents using optimization
   */
  private async assignTasksToPreSelectedAgents(
    tasks: TaskBreakdown[],
    preSelectedAgents: Agent[],
    criteria: AgentSelectionCriteria
  ): Promise<AgentAssignment[]> {
    // Use the same optimization logic but with pre-selected agents only
    const assignments = await this.optimizeAssignments(tasks, preSelectedAgents, criteria);
    return this.balanceWorkload(assignments);
  }

  /**
   * Hybrid approach: use pre-selected agents where possible, supplement with automatic selection
   */
  private async hybridAgentSelection(
    tasks: TaskBreakdown[],
    preSelectedAgents: Agent[],
    criteria: AgentSelectionCriteria
  ): Promise<AgentAssignment[]> {
    // First, assign tasks that pre-selected agents can handle
    const preSelectedAssignments: AgentAssignment[] = [];
    const remainingTasks: TaskBreakdown[] = [];
    
    for (const task of tasks) {
      let assigned = false;
      for (const agent of preSelectedAgents) {
        const skillMatch = this.calculateSkillMatch(agent, task.requiredSkills);
        if (skillMatch > 0.3) { // Minimum skill match threshold
          let assignment = preSelectedAssignments.find(a => a.agentId === agent.id);
          if (!assignment) {
            assignment = {
              agentId: agent.id,
              agentName: agent.name,
              assignedTasks: [],
              skillMatch,
              workload: 0,
              reasoning: `Pre-selected agent with skill match: ${Math.round(skillMatch * 100)}%`
            };
            preSelectedAssignments.push(assignment);
          }
          
          assignment.assignedTasks.push(task.id);
          assignment.workload += task.estimatedEffort || 30;
          assigned = true;
          break;
        }
      }
      
      if (!assigned) {
        remainingTasks.push(task);
      }
    }
    
    // For remaining tasks, use automatic selection from all available agents
    let automaticAssignments: AgentAssignment[] = [];
    if (remainingTasks.length > 0) {
      const candidateAgents = this.filterAgentsByRules(remainingTasks, criteria);
      // Exclude pre-selected agents to avoid double assignment
      const nonPreSelectedCandidates = candidateAgents.filter(agent =>
        !this.preSelectedAgentIds?.includes(agent.id)
      );
      
      if (nonPreSelectedCandidates.length > 0) {
        automaticAssignments = await this.optimizeAssignments(remainingTasks, nonPreSelectedCandidates, criteria);
      }
    }
    
    // Combine assignments
    const allAssignments = [...preSelectedAssignments, ...automaticAssignments];
    const balancedAssignments = this.balanceWorkload(allAssignments);
    
    console.log(`🔄 [AGENT-SELECTOR] Hybrid selection: ${preSelectedAssignments.length} pre-selected, ${automaticAssignments.length} automatic`);
    return balancedAssignments;
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