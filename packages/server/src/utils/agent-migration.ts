/**
 * Agent Migration Utilities
 * 
 * Utilities for migrating existing agents to the autopilot system.
 * Handles backward compatibility and default value assignment.
 */

import { RepositoryFactory } from '@starships/models';
import { Blueprint, AgentMemoryConfig } from '@starships/autopilot';

export interface MigrationStats {
  totalAgents: number;
  migratedAgents: number;
  skippedAgents: number;
  failedAgents: number;
  errors: string[];
}

export class AgentMigration {
  /**
   * Migrate all existing agents to autopilot format
   */
  static async migrateExistingAgents(options: {
    dryRun?: boolean;
    force?: boolean;
  } = {}): Promise<MigrationStats> {
    const { dryRun = false, force = false } = options;
    
    console.log(`🚀 [AGENT-MIGRATION] Starting agent migration (${dryRun ? 'DRY RUN' : 'LIVE'})...`);
    
    const stats: MigrationStats = {
      totalAgents: 0,
      migratedAgents: 0,
      skippedAgents: 0,
      failedAgents: 0,
      errors: []
    };

    try {
      const agentRepo = RepositoryFactory.getAgentRepository();
      const agents = await agentRepo.findAll();
      
      stats.totalAgents = agents.length;
      console.log(`📊 [AGENT-MIGRATION] Found ${agents.length} agents to process`);

      for (const agent of agents) {
        try {
          const needsMigration = this.checkIfAgentNeedsMigration(agent, force);
          
          if (!needsMigration) {
            stats.skippedAgents++;
            console.log(`⏭️ [AGENT-MIGRATION] Skipping agent ${agent.id} (${agent.name}) - already migrated`);
            continue;
          }

          console.log(`🔄 [AGENT-MIGRATION] Migrating agent ${agent.id} (${agent.name})`);
          
          const migrationData = this.buildMigrationData(agent);
          
          if (!dryRun) {
            await agentRepo.update(agent.id, migrationData);
            console.log(`✅ [AGENT-MIGRATION] Successfully migrated agent ${agent.id}`);
          } else {
            console.log(`🔍 [AGENT-MIGRATION] DRY RUN - Would migrate agent ${agent.id} with:`, migrationData);
          }
          
          stats.migratedAgents++;

        } catch (error) {
          stats.failedAgents++;
          const errorMsg = `Failed to migrate agent ${agent.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          stats.errors.push(errorMsg);
          console.error(`❌ [AGENT-MIGRATION] ${errorMsg}`);
        }
      }

      console.log(`🏁 [AGENT-MIGRATION] Migration completed:`, stats);
      return stats;

    } catch (error) {
      const errorMsg = `Fatal migration error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      stats.errors.push(errorMsg);
      console.error(`💀 [AGENT-MIGRATION] ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Check if agent needs migration
   */
  private static checkIfAgentNeedsMigration(agent: any, force: boolean): boolean {
    if (force) {
      return true;
    }

    // Check if agent is missing autopilot fields
    return !agent.executionMode || 
           (!agent.blueprint && agent.executionMode !== 'simple') ||
           !agent.timeout;
  }

  /**
   * Build migration data for an agent
   */
  private static buildMigrationData(agent: any): any {
    const migrationData: any = {};

    // Set execution mode if missing
    if (!agent.executionMode) {
      migrationData.executionMode = 'simple';
      console.log(`  📝 Setting execution mode: simple`);
    }

    // Set timeout if missing
    if (!agent.timeout) {
      migrationData.timeout = 30000; // 30 seconds default
      console.log(`  ⏱️ Setting timeout: 30000ms`);
    }

    // Create default blueprint if missing and needed
    if (!agent.blueprint) {
      migrationData.blueprint = this.createDefaultBlueprint(agent);
      console.log(`  📋 Creating default blueprint for ${agent.category} agent`);
    }

    // Create default memory config if missing
    if (!agent.memory) {
      migrationData.memory = this.createDefaultMemoryConfig(agent);
      console.log(`  🧠 Creating default memory configuration`);
    }

    return migrationData;
  }

  /**
   * Create default blueprint for existing agents
   */
  private static createDefaultBlueprint(agent: any): Blueprint {
    return {
      nodes: [
        {
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Begin conversation',
          parameters: {}
        },
        {
          ref: 'llm-response',
          type: 'llm',
          name: 'Generate Response',
          description: 'Process user input and generate response',
          parameters: {
            model: agent.model || 'anthropic/claude-3.5-sonnet',
            prompt: 'Respond to the user based on the conversation context and your system instructions.',
            temperature: agent.temperature || 0.7,
            maxTokens: agent.maxTokens || 2000,
            timeout: 30000
          }
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete conversation',
          parameters: {}
        }
      ],
      edges: [
        {
          ref: 'edge-1',
          from: 'start',
          to: 'llm-response'
        },
        {
          ref: 'edge-2',
          from: 'llm-response',
          to: 'end'
        }
      ],
      metadata: {
        version: '1.0',
        type: 'migrated-simple-chat',
        category: agent.category || 'general',
        migratedAt: new Date().toISOString(),
        migratedFrom: 'legacy-agent-system'
      }
    };
  }

  /**
   * Create default memory config for existing agents
   */
  private static createDefaultMemoryConfig(agent: any): AgentMemoryConfig {
    return {
      identity: {
        name: agent.name,
        role: this.getRoleFromCategory(agent.category || 'general'),
        personality: this.getPersonalityFromCategory(agent.category || 'general'),
        expertise: agent.tags || []
      },
      purpose: {
        primary: agent.description || `Assist users as a ${agent.category || 'general'} agent`,
        secondary: this.getSecondaryGoalsFromCategory(agent.category || 'general'),
        constraints: [
          'Be helpful and accurate',
          'Follow ethical guidelines',
          'Respect user privacy'
        ]
      },
      space: {
        description: `Professional ${agent.category || 'general'} assistance environment. Focused on providing accurate and helpful responses.`
      }
    };
  }

  /**
   * Helper: Get role from agent category
   */
  private static getRoleFromCategory(category: string): string {
    const roles = {
      general: 'General Assistant',
      coding: 'Software Developer',
      creative: 'Creative Assistant',
      analysis: 'Data Analyst',
      support: 'Support Specialist'
    };
    return roles[category as keyof typeof roles] || 'AI Assistant';
  }

  /**
   * Helper: Get personality from agent category
   */
  private static getPersonalityFromCategory(category: string): string {
    const personalities = {
      general: 'Helpful, knowledgeable, and approachable',
      coding: 'Analytical, detail-oriented, and solution-focused',
      creative: 'Imaginative, inspiring, and innovative',
      analysis: 'Methodical, precise, and insightful',
      support: 'Patient, empathetic, and problem-solving oriented'
    };
    return personalities[category as keyof typeof personalities] || 'Professional and helpful';
  }

  /**
   * Helper: Get secondary goals from agent category
   */
  private static getSecondaryGoalsFromCategory(category: string): string[] {
    const goals = {
      general: ['Provide clear explanations', 'Encourage learning'],
      coding: ['Write clean code', 'Follow best practices', 'Explain technical concepts'],
      creative: ['Inspire creativity', 'Encourage original thinking', 'Provide fresh perspectives'],
      analysis: ['Present clear insights', 'Support decision-making', 'Identify patterns'],
      support: ['Resolve issues quickly', 'Ensure user satisfaction', 'Provide clear guidance']
    };
    return goals[category as keyof typeof goals] || ['Provide helpful assistance'];
  }

  /**
   * Validate migrated agents
   */
  static async validateMigratedAgents(): Promise<{
    valid: number;
    invalid: number;
    issues: Array<{ agentId: string; issues: string[] }>;
  }> {
    console.log('🔍 [AGENT-MIGRATION] Validating migrated agents...');
    
    const result = {
      valid: 0,
      invalid: 0,
      issues: [] as Array<{ agentId: string; issues: string[] }>
    };

    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await agentRepo.findAll();

    for (const agent of agents) {
      const validation = this.validateAgent(agent);
      
      if (validation.valid) {
        result.valid++;
      } else {
        result.invalid++;
        result.issues.push({
          agentId: agent.id,
          issues: validation.errors
        });
      }
    }

    console.log(`✅ [AGENT-MIGRATION] Validation complete: ${result.valid} valid, ${result.invalid} invalid`);
    
    if (result.issues.length > 0) {
      console.warn('⚠️ [AGENT-MIGRATION] Issues found:');
      result.issues.forEach(({ agentId, issues }) => {
        console.warn(`  Agent ${agentId}: ${issues.join(', ')}`);
      });
    }

    return result;
  }

  /**
   * Validate single agent
   */
  private static validateAgent(agent: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required autopilot fields
    if (!agent.executionMode) {
      errors.push('Missing executionMode');
    } else if (!['simple', 'workflow'].includes(agent.executionMode)) {
      errors.push('Invalid executionMode');
    }

    if (!agent.timeout || agent.timeout < 1000) {
      errors.push('Invalid or missing timeout');
    }

    // Check blueprint for workflow agents
    if (agent.executionMode === 'workflow' && !agent.blueprint) {
      errors.push('Workflow agent missing blueprint');
    }

    if (agent.blueprint) {
      try {
        const blueprint = typeof agent.blueprint === 'string' 
          ? JSON.parse(agent.blueprint) 
          : agent.blueprint;
        
        if (!blueprint.nodes || !Array.isArray(blueprint.nodes)) {
          errors.push('Blueprint missing nodes array');
        }
        
        if (!blueprint.edges || !Array.isArray(blueprint.edges)) {
          errors.push('Blueprint missing edges array');
        }
        
        // Check for start and end nodes
        const hasStartNode = blueprint.nodes.some((node: any) => node.type === 'start');
        const hasEndNode = blueprint.nodes.some((node: any) => node.type === 'end');
        
        if (!hasStartNode) {
          errors.push('Blueprint missing start node');
        }
        
        if (!hasEndNode) {
          errors.push('Blueprint missing end node');
        }
        
      } catch (error) {
        errors.push('Blueprint is invalid JSON');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Rollback migration for specific agents
   */
  static async rollbackMigration(agentIds: string[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    console.log(`🔄 [AGENT-MIGRATION] Rolling back migration for ${agentIds.length} agents...`);
    
    const result = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    const agentRepo = RepositoryFactory.getAgentRepository();

    for (const agentId of agentIds) {
      try {
        // Remove autopilot-specific fields
        const updates = {
          blueprint: undefined,
          memory: undefined,
          executionMode: 'simple' as const, // Keep simple mode as fallback
          timeout: undefined
        };

        await agentRepo.update(agentId, updates);
        result.success++;
        console.log(`✅ [AGENT-MIGRATION] Rolled back agent ${agentId}`);
        
      } catch (error) {
        result.failed++;
        const errorMsg = `Failed to rollback agent ${agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        console.error(`❌ [AGENT-MIGRATION] ${errorMsg}`);
      }
    }

    console.log(`🏁 [AGENT-MIGRATION] Rollback complete: ${result.success} success, ${result.failed} failed`);
    return result;
  }
}