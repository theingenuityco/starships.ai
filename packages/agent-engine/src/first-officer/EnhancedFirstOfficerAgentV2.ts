/**
 * Enhanced First Officer Agent V2 - Direct Orchestration with Parallel Execution
 * 
 * This enhanced version integrates:
 * - Vision parsing for expedition goal extraction
 * - Direct task orchestration with pre-selected agents
 * - Parallel execution framework integration
 * - Real-time WebSocket updates
 * - Improved quality assurance and retry logic
 */

import { 
  TaskBreakdown
} from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { ProviderFactory } from '../llm/provider-factory';
import { buildPrompt } from '../prompt/builder';
import { LangChainMemoryStore } from '../memory/langchain-memory';
import { FirstOfficerAgent } from './FirstOfficerAgent';
import { ParallelExecutionFramework } from './parallel/ParallelExecutionFramework';
import { WebSocketEventEmitter } from './parallel/WebSocketEventEmitter';
import {
  FirstOfficerConfig,
  AgentAssignment,
  CompletedTask
} from './types';

/**
 * Vision interface (if not exported from protocol)
 */
interface Vision {
  id: string;
  starshipId: string;
  statement: string;
  refinementCount?: number;
  lastRefined?: string;
}

/**
 * Vision parser for extracting actionable requirements
 */
interface VisionRequirements {
  goals: string[];
  constraints: string[];
  successCriteria: string[];
  priority: 'high' | 'medium' | 'low';
  estimatedComplexity: 'simple' | 'moderate' | 'complex' | 'expert';
}

/**
 * Enhanced configuration with parallel execution options
 */
interface EnhancedFirstOfficerConfig extends FirstOfficerConfig {
  enableVisionParsing: boolean;
  parallelExecutionOptions?: {
    maxConcurrentTasks: number;
    taskTimeout: number;
    enableResourceOptimization: boolean;
    enableAdaptiveScheduling: boolean;
  };
  wsEventEmitter?: WebSocketEventEmitter;
}

/**
 * Enhanced First Officer Agent with direct orchestration capabilities
 */
export class EnhancedFirstOfficerAgentV2 {
  private firstOfficer: FirstOfficerAgent;
  private parallelExecutor: ParallelExecutionFramework;
  private wsEmitter: WebSocketEventEmitter;
  private enhancedConfig: EnhancedFirstOfficerConfig;
  private visionCache: Map<string, Vision> = new Map();
  private memoryStore: LangChainMemoryStore;
  private starshipId: string;

  constructor(
    starshipId: string,
    memoryStore: LangChainMemoryStore,
    config: Partial<EnhancedFirstOfficerConfig> = {},
    selectedAgentIds: string[]
  ) {
    this.starshipId = starshipId;
    this.memoryStore = memoryStore;
    
    // Store enhanced config
    this.enhancedConfig = {
      maxRetries: 3,
      qualityThreshold: 70,
      timeoutMinutes: 60,
      requireUserApproval: false,
      enableParallelExecution: true,
      autoEscalation: true,
      enableVisionParsing: true,
      parallelExecutionOptions: {
        maxConcurrentTasks: 5,
        taskTimeout: 300000, // 5 minutes
        enableResourceOptimization: true,
        enableAdaptiveScheduling: true,
        ...config.parallelExecutionOptions
      },
      ...config
    } as EnhancedFirstOfficerConfig;
    
    // Initialize WebSocket emitter
    this.wsEmitter = config.wsEventEmitter || new WebSocketEventEmitter();
    
    // Initialize parallel execution framework
    this.parallelExecutor = new ParallelExecutionFramework(
      this.enhancedConfig,
      this.wsEmitter
    );
    
    // Initialize wrapped FirstOfficerAgent
    this.firstOfficer = new FirstOfficerAgent(
      starshipId,
      memoryStore,
      config,
      selectedAgentIds
    );
    
    console.log(`🚀 [ENHANCED-FIRST-OFFICER-V2] Initialized with vision parsing and parallel execution`);
  }

  /**
   * Override start expedition to include vision parsing
   */
  async startExpedition(
    expeditionId: string,
    userId: string,
    objective: string
  ): Promise<string> {
    console.log(`🎯 [ENHANCED-FIRST-OFFICER-V2] Starting enhanced expedition orchestration: ${expeditionId}`);

    try {
      // Get expedition details
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw new Error(`Expedition not found: ${expeditionId}`);
      }

      // Parse vision if enabled
      let visionRequirements: VisionRequirements | null = null;
      if (this.enhancedConfig.enableVisionParsing) {
        visionRequirements = await this.parseVisionRequirements(
          expedition.starshipId,
          objective
        );
        
        if (visionRequirements) {
          // Enhance objective with vision requirements
          objective = this.enhanceObjectiveWithVision(objective, visionRequirements);
          
          // Emit vision parsing event
          this.wsEmitter.emit('expedition:vision-parsed', {
            expeditionId,
            requirements: visionRequirements
          });
        }
      }

      // Create enhanced workflow with parallel execution
      const enhancedWorkflow = await this.createEnhancedWorkflow(expeditionId, userId, objective);
      
      // Execute enhanced expedition
      return await enhancedWorkflow.execute();
      
    } catch (error) {
      console.error(`❌ [ENHANCED-FIRST-OFFICER-V2] Failed to start expedition:`, error);
      throw error;
    }
  }

  /**
   * Parse vision to extract actionable requirements
   */
  private async parseVisionRequirements(
    starshipId: string,
    objective: string
  ): Promise<VisionRequirements | null> {
    try {
      console.log(`🔍 [ENHANCED-FIRST-OFFICER-V2] Parsing vision for starship: ${starshipId}`);
      
      // Get vision from cache or database
      let vision = this.visionCache.get(starshipId);
      if (!vision) {
        const visionRepo = RepositoryFactory.getVisionRepository();
        const dbVision = await visionRepo.findByStarship(starshipId);
        if (dbVision) {
          vision = dbVision;
          this.visionCache.set(starshipId, vision);
        }
      }
      
      if (!vision || !vision.statement) {
        console.log(`⚠️ [ENHANCED-FIRST-OFFICER-V2] No vision found for starship`);
        return null;
      }

      // Use LLM to parse vision into requirements
      const prompt = buildPrompt(
        `You are a vision parser that extracts actionable requirements from starship visions.
        
RESPONSE FORMAT (JSON):
{
  "goals": ["goal1", "goal2"],
  "constraints": ["constraint1", "constraint2"],
  "successCriteria": ["criteria1", "criteria2"],
  "priority": "high|medium|low",
  "estimatedComplexity": "simple|moderate|complex|expert"
}

Extract requirements that are relevant to the given objective.`,
        [],
        `VISION: ${vision.statement}\n\nOBJECTIVE: ${objective}\n\nExtract actionable requirements from the vision that relate to this objective.`
      );

      const provider = await ProviderFactory.getProvider('first-officer-system');
      const response = await provider.complete(prompt);
      
      const jsonMatch = response.reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const requirements = JSON.parse(jsonMatch[0]) as VisionRequirements;
        console.log(`✅ [ENHANCED-FIRST-OFFICER-V2] Vision parsed successfully:`, requirements);
        return requirements;
      }
    } catch (error) {
      console.warn(`⚠️ [ENHANCED-FIRST-OFFICER-V2] Vision parsing failed:`, error);
    }

    return null;
  }

  /**
   * Enhance objective with vision requirements
   */
  private enhanceObjectiveWithVision(
    objective: string,
    visionRequirements: VisionRequirements
  ): string {
    const enhancedObjective = `
${objective}

VISION-ALIGNED REQUIREMENTS:
Goals: ${visionRequirements.goals.join(', ')}
Constraints: ${visionRequirements.constraints.join(', ')}
Success Criteria: ${visionRequirements.successCriteria.join(', ')}
Priority: ${visionRequirements.priority}
Complexity: ${visionRequirements.estimatedComplexity}
`;
    
    return enhancedObjective.trim();
  }

  /**
   * Create enhanced workflow with parallel execution
   */
  private async createEnhancedWorkflow(expeditionId: string, userId: string, objective: string) {
    const self = this;
    
    return {
      async execute(): Promise<string> {
        // Start the base first officer workflow
        const result = await self.firstOfficer.startExpedition(expeditionId, userId, objective);
        return result;
      }
    };
  }

  /**
   * Execute tasks with parallel execution framework
   */
  async executeTasksWithParallelFramework(state: any): Promise<Partial<any>> {
    console.log(`🚀 [ENHANCED-FIRST-OFFICER-V2] Starting parallel task execution`);
    
    try {
      // Get task assignments
      const tasks = state.taskBreakdown as TaskBreakdown[];
      const assignments = state.selectedAgents as AgentAssignment[];
      
      if (!tasks || tasks.length === 0 || !assignments || assignments.length === 0) {
        throw new Error('No tasks or agents available for execution');
      }

      // Emit execution start
      this.wsEmitter.emit('expedition:execution-start', {
        expeditionId: state.expeditionId,
        taskCount: tasks.length,
        agentCount: assignments.length,
        mode: 'parallel'
      });

      // Execute tasks in parallel
      const execution$ = await this.parallelExecutor.executeParallel(
        tasks,
        assignments,
        state.expeditionId,
        state.userId,
        this.enhancedConfig.parallelExecutionOptions
      );

      // Collect completed tasks
      const completedTasks: CompletedTask[] = [];
      
      // Subscribe to execution stream
      await new Promise<void>((resolve, reject) => {
        execution$.subscribe({
          next: (completed) => {
            completedTasks.push(completed);
            
            // Update task status in database
            const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
            taskRepo.updateStatus(completed.taskId, 'completed').catch(console.error);
            
            // Emit progress update
            const progress = (completedTasks.length / tasks.length) * 100;
            this.wsEmitter.emit('expedition:progress', {
              expeditionId: state.expeditionId,
              progress,
              completedTasks: completedTasks.length,
              totalTasks: tasks.length
            });
          },
          error: (error) => {
            console.error(`❌ [ENHANCED-FIRST-OFFICER-V2] Parallel execution failed:`, error);
            reject(error);
          },
          complete: () => {
            console.log(`✅ [ENHANCED-FIRST-OFFICER-V2] Parallel execution completed`);
            resolve();
          }
        });
      });

      return {
        currentPhase: 'synthesizing',
        completedTasks,
        activeExecutions: [],
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ [ENHANCED-FIRST-OFFICER-V2] Task execution failed:`, error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Parallel execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Monitor progress with parallel execution integration
   */
  async monitorProgressWithParallelFramework(state: any): Promise<Partial<any>> {
    console.log(`📊 [ENHANCED-FIRST-OFFICER-V2] Monitoring parallel execution progress`);
    
    // Get execution state from parallel executor
    const executionState = await new Promise<any>(resolve => {
      this.parallelExecutor.getExecutionState()
        .subscribe(state => {
          if (state) {
            resolve(state);
          }
        });
    });

    if (executionState) {
      // Emit detailed progress report
      this.wsEmitter.emit('expedition:detailed-progress', {
        expeditionId: state.expeditionId,
        ...executionState
      });
      
      // Check if execution is complete
      if (executionState.completedTasks === executionState.totalTasks) {
        return {
          currentPhase: 'synthesizing',
          lastUpdated: new Date().toISOString()
        };
      }
    }

    return {
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Enhanced quality check with retry orchestration
   */
  async performEnhancedQualityCheck(state: any, qualityChecks: any[]): Promise<any> {
    console.log(`🔍 [ENHANCED-FIRST-OFFICER-V2] Performing enhanced quality checks`);
    
    const result = { qualityChecks };
    
    // If quality checks failed, orchestrate retries with different agents
    const failedChecks = result.qualityChecks?.filter(qc => !qc.approved) || [];
    
    if (failedChecks.length > 0 && this.enhancedConfig.autoEscalation) {
      console.log(`🔄 [ENHANCED-FIRST-OFFICER-V2] Orchestrating quality-based retries`);
      
      // Find alternative agents for failed tasks
      const alternativeAssignments = await this.findAlternativeAgents(
        failedChecks
      );
      
      if (alternativeAssignments.length > 0) {
        // Emit retry orchestration event
        this.wsEmitter.emit('expedition:retry-orchestration', {
          expeditionId: state.expeditionId,
          failedTasks: failedChecks.length,
          alternativeAgents: alternativeAssignments.length
        });
        
        return {
          ...result,
          selectedAgents: [
            ...(state.selectedAgents || []),
            ...alternativeAssignments
          ],
          retryOrchestrated: true
        };
      }
    }
    
    return result;
  }

  /**
   * Find alternative agents for failed tasks
   */
  private async findAlternativeAgents(
    failedChecks: any[]
  ): Promise<AgentAssignment[]> {
    // Implementation would find agents with different skills
    // or higher expertise levels for retry attempts
    console.log(`🔍 [ENHANCED-FIRST-OFFICER-V2] Finding alternative agents for ${failedChecks.length} failed tasks`);
    
    // This is a simplified implementation
    // In production, this would use more sophisticated agent matching
    return [];
  }

  /**
   * Get real-time execution metrics
   */
  async getExecutionMetrics(expeditionId: string) {
    const metrics = this.parallelExecutor.getExecutionMetrics();
    const activeTaskCount = this.parallelExecutor.getActiveTaskCount();
    
    return {
      expeditionId,
      activeTaskCount,
      ...metrics
    };
  }

  /**
   * Stop expedition execution
   */
  async stopExpedition(expeditionId: string): Promise<void> {
    console.log(`🛑 [ENHANCED-FIRST-OFFICER-V2] Stopping expedition: ${expeditionId}`);
    
    // Stop parallel execution
    this.parallelExecutor.stopExecution();
    
    // Update expedition status
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    await expeditionRepo.updateStatus(expeditionId, 'cancelled');
    
    // Emit stop event
    this.wsEmitter.emit('expedition:stopped', { expeditionId });
  }

  /**
   * Handle dynamic agent reassignment during execution
   */
  async reassignTask(
    expeditionId: string,
    taskId: string,
    newAgentId: string,
    reason: string
  ): Promise<void> {
    console.log(`🔄 [ENHANCED-FIRST-OFFICER-V2] Reassigning task ${taskId} to agent ${newAgentId}`);
    
    // Update task assignment
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    await taskRepo.assignToAgent(taskId, newAgentId);
    
    // Emit reassignment event
    this.wsEmitter.emit('task:reassigned', {
      expeditionId,
      taskId,
      newAgentId,
      reason
    });
  }
  
  /**
   * Get expedition status
   */
  async getExpeditionStatus(expeditionId: string) {
    return await this.firstOfficer.getExpeditionStatus(expeditionId);
  }
  
  /**
   * Resume expedition
   */
  async resumeExpedition(expeditionId: string): Promise<string> {
    return await this.firstOfficer.resumeExpedition(expeditionId);
  }
  
  /**
   * Handle user message
   */
  async handleUserMessage(expeditionId: string, userMessage: string) {
    return await this.firstOfficer.handleUserMessage(expeditionId, userMessage);
  }
}