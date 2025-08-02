/**
 * MCP-Enhanced Task Executor
 * 
 * Wraps the TaskExecutor with MCP tool integration, allowing agents
 * to leverage MCP servers during task execution.
 */

import { TaskExecutor } from './TaskExecutor';
import { FirstOfficerConfig, AgentAssignment, TaskExecutionOptions, CompletedTask } from './types';
import { TaskBreakdown } from '@starships/protocol';
import { LangChainMemoryStore } from '../memory/langchain-memory';
import { MCPToolGateway, mcpToolGateway } from '@starships/core';
import { MCPToolWrapper } from '../tools/MCPToolWrapper';
import { DynamicTool } from '@langchain/core/tools';
import { RepositoryFactory } from '@starships/models';
import { Observable } from 'rxjs';

export class MCPEnhancedTaskExecutor {
  private taskExecutor: TaskExecutor;
  private mcpGateway: MCPToolGateway;
  private mcpToolsByAgent: Map<string, DynamicTool[]> = new Map();
  private toolWrappers: Map<string, MCPToolWrapper> = new Map();
  private mcpEnabled: boolean = true;
  private starshipId: string | null = null;

  constructor(
    config: FirstOfficerConfig, 
    memoryStore: LangChainMemoryStore,
    options?: {
      mcpEnabled?: boolean;
      customGateway?: MCPToolGateway;
    }
  ) {
    // Create the base task executor
    this.taskExecutor = new TaskExecutor(config, memoryStore);
    
    // Initialize MCP gateway
    this.mcpGateway = options?.customGateway || mcpToolGateway;
    this.mcpEnabled = options?.mcpEnabled ?? true;
    
    console.log('[MCPEnhancedTaskExecutor] Initialized with MCP support:', this.mcpEnabled);
  }

  /**
   * Set the starship ID for MCP tool discovery
   */
  async setStarshipId(starshipId: string): Promise<void> {
    this.starshipId = starshipId;
    console.log(`[MCPEnhancedTaskExecutor] Set starship ID: ${starshipId}`);
    
    // Enable MCP on the underlying task executor
    this.taskExecutor.enableMCP(starshipId);
    
    // Clear cached tools when starship changes
    this.mcpToolsByAgent.clear();
    this.toolWrappers.clear();
  }

  /**
   * Initialize MCP tools for an agent
   */
  async initializeMCPToolsForAgent(agentId: string): Promise<DynamicTool[]> {
    if (!this.mcpEnabled || !this.starshipId) {
      console.log('[MCPEnhancedTaskExecutor] MCP disabled or no starship ID set');
      return [];
    }

    // Check cache first
    const cachedTools = this.mcpToolsByAgent.get(agentId);
    if (cachedTools) {
      console.log(`[MCPEnhancedTaskExecutor] Returning cached MCP tools for agent ${agentId}`);
      return cachedTools;
    }

    try {
      console.log(`[MCPEnhancedTaskExecutor] Initializing MCP tools for agent ${agentId}`);
      
      // Create tool wrapper for this agent
      const toolWrapper = new MCPToolWrapper({
        starshipId: this.starshipId,
        agentId: agentId,
        gateway: this.mcpGateway,
        enableLogging: true
      });
      
      // Get all available tools
      const mcpTools = await toolWrapper.createAllTools();
      
      // Cache the tools and wrapper
      this.mcpToolsByAgent.set(agentId, mcpTools);
      this.toolWrappers.set(agentId, toolWrapper);
      
      console.log(`[MCPEnhancedTaskExecutor] Initialized ${mcpTools.length} MCP tools for agent ${agentId}`);
      return mcpTools;
      
    } catch (error) {
      console.error(`[MCPEnhancedTaskExecutor] Failed to initialize MCP tools for agent ${agentId}:`, error);
      // Return empty array to allow graceful degradation
      return [];
    }
  }

  /**
   * Execute tasks with MCP tool enhancement
   */
  async executeTasks(
    tasks: TaskBreakdown[],
    assignments: AgentAssignment[],
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions = {}
  ): Promise<Observable<CompletedTask>> {
    console.log(`[MCPEnhancedTaskExecutor] Executing ${tasks.length} tasks with MCP enhancement`);
    
    // Enhance task descriptions with MCP tool information if enabled
    if (this.mcpEnabled && this.starshipId) {
      await this.enhanceTasksWithMCPTools(tasks, assignments);
    }
    
    // Delegate to the wrapped task executor
    return this.taskExecutor.executeTasks(tasks, assignments, expeditionId, userId, options);
  }
  
  /**
   * Enhance tasks with MCP tool information
   */
  private async enhanceTasksWithMCPTools(
    tasks: TaskBreakdown[],
    assignments: AgentAssignment[]
  ): Promise<void> {
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    
    for (const assignment of assignments) {
      // Initialize MCP tools for this agent
      await this.initializeMCPToolsForAgent(assignment.agentId);
      const mcpTools = this.mcpToolsByAgent.get(assignment.agentId) || [];
      
      if (mcpTools.length > 0) {
        // Enhance each assigned task
        for (const taskId of assignment.assignedTasks) {
          const task = tasks.find(t => t.id === taskId);
          if (task) {
            const enhancedDescription = this.enhanceInstructionWithMCPTools(
              task.description,
              mcpTools
            );
            
            // Update the task description
            task.description = enhancedDescription;
            
            // Also update in the database if the task exists
            try {
              const dbTask = await taskRepo.findById(taskId);
              if (dbTask) {
                await taskRepo.update(taskId, { description: enhancedDescription });
              }
            } catch (error) {
              console.warn(`[MCPEnhancedTaskExecutor] Could not update task ${taskId} in DB:`, error);
            }
          }
        }
      }
    }
  }

  /**
   * Enhance task instruction with available MCP tools
   */
  private enhanceInstructionWithMCPTools(instruction: string, tools: DynamicTool[]): string {
    const toolDescriptions = tools.map(tool => 
      `- ${tool.name}: ${tool.description}`
    ).join('\n');
    
    const enhancement = `
You have access to the following MCP tools to help complete this task:

${toolDescriptions}

Guidelines for using MCP tools:
1. Use Sequential Thinking tools for complex reasoning and problem decomposition
2. Use Memory tools to store and retrieve important context
3. Use web automation tools for research and data gathering
4. Always validate tool outputs before using them
5. If a tool fails, try alternative approaches

Original task instruction:
${instruction}
`;

    return enhancement;
  }

  /**
   * Get MCP tool usage statistics for all agents
   */
  getGlobalMCPStats(): Record<string, any> {
    const globalStats: Record<string, any> = {
      totalAgentsWithMCP: this.mcpToolsByAgent.size,
      toolsByAgent: {},
      usageByAgent: {}
    };
    
    for (const [agentId, tools] of this.mcpToolsByAgent.entries()) {
      globalStats.toolsByAgent[agentId] = tools.length;
      
      const wrapper = this.toolWrappers.get(agentId);
      if (wrapper) {
        globalStats.usageByAgent[agentId] = wrapper.getUsageStats();
      }
    }
    
    return globalStats;
  }

  /**
   * Clear MCP tool caches
   */
  clearMCPCache(): void {
    this.mcpToolsByAgent.clear();
    this.toolWrappers.clear();
    this.mcpGateway.clearCache();
    console.log('[MCPEnhancedTaskExecutor] Cleared all MCP caches');
  }

  /**
   * Check if MCP tools are available for the current starship
   */
  async checkMCPAvailability(): Promise<{
    available: boolean;
    toolCount: number;
    services: string[];
  }> {
    if (!this.mcpEnabled || !this.starshipId) {
      return { available: false, toolCount: 0, services: [] };
    }
    
    try {
      const tools = await this.mcpGateway.getToolsForStarship(this.starshipId);
      const services = [...new Set(tools.map((t: any) => t.templateSlug))];
      
      return {
        available: tools.length > 0,
        toolCount: tools.length,
        services: services as string[]
      };
    } catch (error) {
      console.error('[MCPEnhancedTaskExecutor] Error checking MCP availability:', error);
      return { available: false, toolCount: 0, services: [] };
    }
  }

  /**
   * Enable or disable MCP integration
   */
  setMCPEnabled(enabled: boolean): void {
    this.mcpEnabled = enabled;
    if (!enabled) {
      this.clearMCPCache();
    }
    console.log(`[MCPEnhancedTaskExecutor] MCP integration ${enabled ? 'enabled' : 'disabled'}`);
  }
}