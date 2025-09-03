/**
 * Mission Orchestrator Agent - AI Response Generation for Mission Coordination
 * 
 * Provides intelligent responses for mission guidance and coordination
 * using direct LLM integration with mission context awareness.
 */

import { MissionRepository, AgentRepository, StarshipRepository, MissionClarityRepository } from '@starships/models';
import { Logger } from '../utils/logger';
import { MissionEventService } from './MissionEventService';
import { MissionService } from './MissionService';
import { WorkflowParsingService } from './WorkflowParsingService';
import { MissionPromptBuilder } from '../prompts/MissionPromptBuilder';
import { MISSION_PHASES } from '@starships/protocol';
import { Workflow, AgentMemory, LLM } from '@starships/autopilot';
import type { LlmNodeParameters } from '@starships/autopilot';
import type {
  MissionModel,
  MissionPhase,
  MissionClarityModel,
  CreateMissionClarityRequest
} from '@starships/protocol';
import type { BlueprintModel } from '@starships/protocol';
import type { StarshipModel } from '@starships/protocol';
import type { AgentModel } from '@starships/protocol';

/**
 * Configuration for MissionOrchestratorAgent
 */
export interface MissionOrchestratorAgentConfig {
  temperature?: number;
  maxTokens?: number;
  provider?: 'openai' | 'anthropic';
  model?: string;
  openrouterApiKey?: string;
}

/**
 * Simple message interface to replace AIMessage
 */
interface SimpleMessage {
  content: string;
  name?: string;
}

/**
 * Callbacks for real-time execution
 */
export interface GraphExecutionCallbacks {
  onMessageGenerated: (message: SimpleMessage, nodeId: string, missionId: string) => Promise<void>;
  onPhaseChange?: (newPhase: MissionPhase, missionId: string) => Promise<void>;
  onStateUpdate?: (state: Partial<MissionChatState>) => Promise<void>;
}

/**
 * Mission metadata for AI response generation
 */
interface MissionMetadata {
  mission: MissionModel;
  starship: StarshipModel;
}

/**
 * Mission chat state for context management
 */
export interface MissionChatState {
  missionId: string;
  activePhase: MissionPhase;
  isSystemInitiated: boolean;
  metadata: MissionMetadata | null;
  clarity: MissionClarityModel | undefined;
  blueprint: BlueprintModel | undefined;
  executionResult: any | undefined;
  messages: Array<SimpleMessage>;
}

/**
 * Intent classification result for workflow approval
 */
interface WorkflowApprovalIntent {
  intent: 'approve' | 'reject' | 'discussion' | 'unclear';
  confidence: number;
  reasoning: string;
}

/**
 * Result of processing workflow approval intent
 */
interface WorkflowApprovalResult {
  shouldUpdate: boolean;
  newStatus?: 'approved' | 'rejected';
  rejectionReason?: string;
  responseMessage?: string;
}

/**
 * MissionOrchestratorAgent - Generates intelligent AI responses for mission coordination
 */
export class MissionOrchestratorAgent {
  private logger: Logger;
  private llm: LLM | null = null;
  
  // Clarity assessment configuration constants
  private static readonly CLARITY_THRESHOLD = 7.5;
  private static readonly MAX_CLARITY_ITERATIONS = 10;
  
  private readonly config: Required<MissionOrchestratorAgentConfig> = {
    temperature: 0.9,
    maxTokens: 1000,
    provider: 'openai',
    model: 'gpt-4o',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || ''
  };

  constructor(config?: Partial<MissionOrchestratorAgentConfig>) {
    this.logger = Logger.getInstance();
    
    // Merge provided config with defaults
    if (config) {
      Object.assign(this.config, config);
    }
  }

  /**
   * Generate AI response for mission coordination
   */
  async generateResponse(message: string, missionId: string): Promise<string> {
    try {
      // Build initial state
      const state = await this.buildInitialState(missionId, message);
      
      // Process message through appropriate phase handler
      const response = await this.processMessage(state);
      
      return response;
    } catch (error) {
      this.logger.error('Failed to generate orchestrator response', {
        service: 'MissionOrchestratorAgent',
        operation: 'generateResponse',
        missionId
      }, error as Error);
      return this.getFallbackResponse();
    }
  }

  /**
   * Generate response with execution callbacks
   */
  async executeWithCallbacks(
    missionId: string,
    input: string,
    callbacks: GraphExecutionCallbacks,
    isSystemMessage: boolean = false
  ): Promise<{ finalResponse: string; state: Partial<MissionChatState> }> {
    try {
      // Build initial state
      const state = await this.buildInitialState(missionId, input, isSystemMessage);
      
      // Process message and get response
      const response = await this.processMessage(state);
      
      // Create simple message for callback
      const simpleMessage: SimpleMessage = {
        content: response,
        name: `Commander ARIA-${missionId.slice(-4)}`
      };
      
      // Execute callback
      if (callbacks.onMessageGenerated) {
        await callbacks.onMessageGenerated(
          simpleMessage,
          `${state.activePhase}_phase`,
          missionId
        );
      }
      
      return { finalResponse: response, state };
    } catch (error) {
      this.logger.error('Failed to execute with callbacks', {
        service: 'MissionOrchestratorAgent',
        operation: 'executeWithCallbacks',
        missionId
      }, error as Error);
      
      throw error;
    }
  }

  /**
   * Generate system-initiated response
   */
  async generateSystemResponse(missionId: string, message: string): Promise<string> {
    try {
      const state = await this.buildInitialState(missionId, message, true);
      return await this.processMessage(state);
    } catch (error) {
      this.logger.error('Failed to generate system response', error as Error);
      return this.getFallbackResponse();
    }
  }

  /**
   * Build initial state for processing
   */
  private async buildInitialState(
    missionId: string,
    message: string,
    isSystemInitiated: boolean = false
  ): Promise<MissionChatState> {
    // Load mission metadata
    const metadata = await this.loadMissionMetadata(missionId);
    
    // Load existing blueprint and clarity
    const [blueprint, clarity] = await Promise.all([
      MissionService.getWorkflowByMissionId(missionId),
      this.getClarityFromDB(missionId)
    ]);

    // Create message object
    const messageObj: SimpleMessage = {
      content: message
    };

    return {
      missionId,
      activePhase: metadata.mission.phase,
      isSystemInitiated,
      metadata,
      clarity: clarity || undefined,
      blueprint: blueprint || undefined,
      executionResult: undefined, // Execution results now managed by autopilot workflow system
      messages: [messageObj]
    };
  }

  /**
   * Process message based on current phase
   */
  private async processMessage(state: MissionChatState): Promise<string> {
    const phase = state.activePhase || MISSION_PHASES.WELCOME;
    
    switch (phase) {
      case MISSION_PHASES.WELCOME:
        return await this.handleWelcomePhase(state);
      case MISSION_PHASES.ANALYSIS:
        return await this.handleAnalysisPhase(state);
      case MISSION_PHASES.PLAN:
        return await this.handlePlanPhase(state);
      case MISSION_PHASES.EXECUTE:
        return await this.handleExecutePhase(state);
      case MISSION_PHASES.CONVERSE:
        return await this.handleConversePhase(state);
      default:
        return await this.handleWelcomePhase(state);
    }
  }

  /**
   * Handle welcome phase
   */
  private async handleWelcomePhase(state: MissionChatState): Promise<string> {
    const systemPrompt = new MissionPromptBuilder(state).buildWelcomePrompt();
    
    const response = await this.callLLM(systemPrompt);
    
    // Update mission phase to analysis after welcome
    if (state.metadata) {
      await MissionService.updateMission(state.missionId, { phase: MISSION_PHASES.ANALYSIS });
    }
    
    return response;
  }

  /**
   * Handle analysis phase - mission clarity assessment
   */
  private async handleAnalysisPhase(state: MissionChatState): Promise<string> {
    // Assess current clarity
    const clarity = await this.assessAndSaveClarity(state);
    
    // Check if analysis is complete
    const isComplete = clarity.overallScore >= MissionOrchestratorAgent.CLARITY_THRESHOLD || 
                      clarity.iteration >= MissionOrchestratorAgent.MAX_CLARITY_ITERATIONS;
    
    const isFirstIteration = clarity.iteration === 1;
    const updatedState = { ...state, clarity };

    if (isComplete) {
      // Generate completion summary and move to plan phase
      const summary = await this.generateCompletionSummary(updatedState, clarity, isFirstIteration);
      
      // Update mission phase to plan
      if (state.metadata) {
        await MissionService.updateMission(state.missionId, { phase: MISSION_PHASES.PLAN });
      }
      
      return summary;
    } else {
      // Generate next question
      return await this.generateFocusedQuestion(updatedState, clarity, isFirstIteration);
    }
  }

  /**
   * Handle plan phase - blueprint generation and approval
   */
  private async handlePlanPhase(state: MissionChatState): Promise<string> {
    try {
      const { metadata } = state;
      
      if (!metadata) throw new Error('Missing metadata in state');
      
      // Get blueprint from state or generate new one
      let blueprint = state.blueprint;
      
      if (!blueprint || state.isSystemInitiated || metadata.mission.approvalStatus === 'rejected') {
        // Generate new blueprint
        blueprint = await this.generateBlueprint(metadata.mission.id, state);
        
        // Update mission phase in database
        await MissionService.updateMission(metadata.mission.id, {
          phase: MISSION_PHASES.PLAN,
          blueprintId: blueprint.id,
          approvalStatus: 'pending'
        });
      } else if (metadata.mission.approvalStatus === 'pending') {
        // Handle blueprint approval intent
        const recentMessage = state.messages[state.messages.length - 1];
        if (recentMessage && recentMessage.content && typeof recentMessage.content === 'string') {
          const intent = await this.classifyWorkflowApprovalIntent(recentMessage.content, state);
          const taskCount = blueprint.nodes.filter((n: any) => n.type === 'agent').length;
          const approvalResult = await this.processWorkflowApprovalIntent(intent, recentMessage.content, taskCount);
          
          if (approvalResult.shouldUpdate && approvalResult.newStatus) {
            await MissionService.updateMission(metadata.mission.id, {
              approvalStatus: approvalResult.newStatus,
              ...(approvalResult.newStatus === 'approved' && { approvedAt: new Date().toISOString() })
            });
          }
          
          if (approvalResult.responseMessage && !approvalResult.shouldUpdate) {
            return approvalResult.responseMessage;
          }
        }
      }
      
      // Present blueprint for approval (only for pending)
      if (metadata.mission.approvalStatus === 'pending') {
        const prompt = new MissionPromptBuilder({ ...state, blueprint }).buildWorkflowPresentationPrompt(blueprint);
        return await this.callLLM(prompt.messages[0].content);
      }
      
      // For approved blueprints, move to execute phase
      if (metadata.mission.approvalStatus === 'approved') {
        await MissionService.updateMission(metadata.mission.id, { phase: MISSION_PHASES.EXECUTE });
        return this.handleExecutePhase({ ...state, blueprint });
      }
      
      return "Blueprint processing completed. Please provide feedback or approval.";
    } catch (error) {
      this.logger.error('Plan phase failed', { error });
      return "I encountered an issue with the planning phase. Let me help you start over with the analysis.";
    }
  }

  /**
   * Handle execute phase - run approved blueprint
   */
  private async handleExecutePhase(state: MissionChatState): Promise<string> {
    const { blueprint, missionId, metadata } = state;
    
    if (!blueprint || !metadata || metadata.mission.approvalStatus !== 'approved') {
      return "⚠️ Blueprint must be approved before execution can begin.";
    }

    try {
      const agentTaskCount = blueprint.nodes.filter((n: any) => n.type === 'agent').length;
      const message = `🚀 Starting mission execution with ${agentTaskCount} tasks...\n\nI'll run each task sequentially and keep you updated on the progress. This may take a few minutes depending on the complexity of the tasks.`;
      
      // Start execution in background
      this.startMissionExecution(missionId, blueprint);
      
      return message;
    } catch (error) {
      return `❌ Failed to start mission execution: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Handle converse phase - ongoing mission conversation
   */
  private async handleConversePhase(state: MissionChatState): Promise<string> {
    const systemPrompt = new MissionPromptBuilder(state).buildConversePrompt();
    
    return await this.callLLM(systemPrompt);
  }

  /**
   * Start mission execution in background using autopilot workflow system
   */
  private async startMissionExecution(missionId: string, blueprint: BlueprintModel): Promise<void> {
    try {
      // Convert BlueprintModel to autopilot Workflow
      const autopilotWorkflow = this.convertToAutopilotWorkflow(blueprint);
      
      // Create agent memory for workflow execution context
      const agentMemory = new AgentMemory();
      agentMemory.addMessage('system', 'Mission execution coordinator');
      agentMemory.setIdentity({
        name: 'Mission Executor',
        role: 'Workflow Coordinator',
        personality: 'Systematic, thorough, results-oriented'
      });
      agentMemory.setPurpose({
        primary: 'Execute mission workflow tasks sequentially and efficiently',
        secondary: ['Track task progress', 'Handle errors gracefully', 'Provide detailed results']
      });
      agentMemory.setSpace({
        description: `Executing mission ${missionId} with ${blueprint.nodes.filter((n: any) => n.type === 'agent').length} tasks`
      });
      
      this.logger.info('Starting mission execution with autopilot workflow system', {
        missionId,
        blueprintId: blueprint.id,
        agentNodesCount: blueprint.nodes.filter((n: any) => n.type === 'agent').length
      });
      
      // Execute workflow using autopilot
      const execution = {
        status: 'not_started' as const,
        executionResults: new Map(),
        agentMemory: agentMemory
      };
      
      const result = await autopilotWorkflow.execute(execution);
      
      // Update mission phase to converse after execution
      await MissionService.updateMission(missionId, {
        phase: MISSION_PHASES.CONVERSE
      });
      
      // Send completion message
      let completionMessage: string;
      
      if (result.status === 'completed') {
        const executionResults = Array.from(result.executionResults.entries());
        const nodeResultsSummary = executionResults.map(([nodeRef, nodeResult], index) =>
          `${index + 1}. **${nodeRef}**: ✅ Completed\n   ${nodeResult.data ? JSON.stringify(nodeResult.data).substring(0, 150) + '...' : 'No output'}`
        ).join('\n') || 'No detailed results available.';
        
        completionMessage = `✅ **Mission execution completed successfully!**\n\nExecuted ${executionResults.length} tasks successfully.\n\n📋 **Execution Details:**\n${nodeResultsSummary}\n\n🎯 **What's next?**\nYou can now ask me questions about the results, request additional analysis, or start a new mission. How can I help you make the most of these results?`;
      } else {
        const error = result.error || 'Unknown execution error';
        completionMessage = `❌ **Mission execution encountered issues**\n\nExecution Status: ${result.status}\nError: ${error}\n\n🔧 **Next steps:**\n- Review the error details above\n- Consider modifying the plan to address the issues\n- Or ask me to regenerate the workflow\n\nWhat would you like to do?`;
      }
        
      // Send system message
      const { MissionOrchestratorService } = await import('./MissionOrchestratorService');
      const orchestratorService = MissionOrchestratorService.getInstance();
      await orchestratorService.handleSystemMessage(missionId, completionMessage);
      
    } catch (error) {
      this.logger.error('Background mission execution failed', {
        missionId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      const errorMessage = `❌ **Mission execution encountered a critical error**\n\nError: ${error instanceof Error ? error.message : 'Unknown system error'}\n\n🔧 **Recovery options:**\n- Try regenerating the workflow plan\n- Check agent assignments and availability\n- Contact support if the issue persists\n\nHow would you like to proceed?`;
      
      const { MissionOrchestratorService } = await import('./MissionOrchestratorService');
      const orchestratorService = MissionOrchestratorService.getInstance();
      await orchestratorService.handleSystemMessage(missionId, errorMessage);
    }
  }

  /**
   * Convert BlueprintModel to autopilot Workflow format
   */
  private convertToAutopilotWorkflow(blueprint: BlueprintModel): Workflow {
    const workflow = new Workflow();
    
    // Add nodes
    blueprint.nodes.forEach((node: any) => {
      workflow.addNode({
        ref: node.ref || node.id,
        type: node.type as any, // Convert to autopilot node types
        name: node.name,
        description: node.description || '',
        parameters: node.parameters || {}
      });
    });
    
    // Add edges
    blueprint.edges.forEach((edge: any) => {
      workflow.addEdge(edge.from, edge.to);
    });
    
    return workflow;
  }

  /**
   * Generate blueprint using AI
   */
  private async generateBlueprint(missionId: string, state: MissionChatState): Promise<BlueprintModel> {
    const agents = await this.getAssignedAgents(missionId);
    const prompt = new MissionPromptBuilder(state).buildWorkflowGenerationPrompt(agents);
    const aiResponse = await this.callLLM(prompt.messages[0].content);
    
    console.log('[Blueprint Generation] LLM Response:', aiResponse);
    
    const createRequest = WorkflowParsingService.parseAIResponse(aiResponse, missionId, agents);
    
    // TODO: Replace with proper BlueprintModel creation using BlueprintRepository
    // For now, return a mock BlueprintModel structure
    const mockBlueprint: BlueprintModel = {
      id: `blueprint-${missionId}`,
      name: `Mission ${missionId} Blueprint`,
      description: `Execution blueprint for mission ${missionId}`,
      category: 'mission',
      nodes: createRequest.blueprint!.nodes,
      edges: createRequest.blueprint!.edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return mockBlueprint;
  }

  /**
   * Get agents assigned to mission
   */
  private async getAssignedAgents(missionId: string): Promise<AgentModel[]> {
    try {
      const missionRepo = new MissionRepository();
      const mission = await missionRepo.getMissionById(missionId);
      
      if (!mission.agentIds || mission.agentIds.length === 0) {
        throw new Error('No agents assigned to mission');
      }

      const agentRepo = new AgentRepository();
      const agents: AgentModel[] = [];
      
      for (const agentId of mission.agentIds) {
        const agent = await agentRepo.findById(agentId);
        if (agent) {
          agents.push(agent);
        }
      }
      
      if (agents.length === 0) {
        throw new Error('No valid agents found for mission');
      }
      
      return agents;
    } catch (error) {
      this.logger.error('Failed to get assigned agents', { missionId, error });
      throw error;
    }
  }

  /**
   * Load mission metadata
   */
  private async loadMissionMetadata(missionId: string): Promise<MissionMetadata> {
    try {
      const missionRepo = new MissionRepository();
      const mission = await missionRepo.getMissionById(missionId);

      if (!mission.starshipId) {
        throw new Error(`Mission ${missionId} has no associated starship`);
      }

      const starshipRepo = new StarshipRepository();
      const starship = await starshipRepo.findById(mission.starshipId);

      if (!starship) {
        throw new Error(`Starship not found: ${mission.starshipId}`);
      }

      return { mission, starship };
    } catch (error) {
      this.logger.error('Failed to load mission metadata', error as Error);
      throw error;
    }
  }


  /**
   * Call LLM for response generation
   */
  private async callLLM(promptContent: string): Promise<string> {
    try {
      // Create LLM instance with specific prompt for each call
      const llmConfig: LlmNodeParameters = {
        model: this.config.model,
        prompt: promptContent,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        openrouterApiKey: this.config.openrouterApiKey
      };

      const llm = new LLM(llmConfig);
      const result = await llm.execute();

      if (result.status === 'completed' && result.data?.llmResponse) {
        return result.data.llmResponse;
      } else {
        throw new Error(`LLM execution failed: ${result.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      this.logger.error('Failed to call LLM', error as Error);
      throw error;
    }
  }

  /**
   * Generate fallback response when LLM fails
   */
  private getFallbackResponse(): string {
    return `I'm here to help guide your mission. Could you provide more details about what you need assistance with?`;
  }

  // ============================================================================
  // CLARITY ASSESSMENT METHODS
  // ============================================================================

  /**
   * Assess clarity and save to database
   */
  private async assessAndSaveClarity(state: MissionChatState): Promise<MissionClarityModel> {
    try {
      const currentClarity = await this.getClarityFromDB(state.missionId);
      const iteration = (currentClarity?.iteration || 0) + 1;
      
      const stateWithClarity = { ...state, clarity: currentClarity || undefined };
      const clarityRequest = await this.assessMissionClarity(stateWithClarity, iteration);
      clarityRequest.missionId = state.missionId;
      
      const clarityRepo = new MissionClarityRepository();
      const updatedClarity = await clarityRepo.upsertByMissionId(state.missionId, clarityRequest);
      
      const missionEventService = MissionEventService.getInstance();
      missionEventService.emitClarityUpdate(state.missionId, updatedClarity);
      
      return updatedClarity;
    } catch (error) {
      this.logger.error('Failed to assess and save clarity', { missionId: state.missionId, error });
      throw error;
    }
  }

  /**
   * AI clarity assessment using LLM
   */
  private async assessMissionClarity(state: MissionChatState, iteration: number): Promise<CreateMissionClarityRequest> {
    const systemPrompt = new MissionPromptBuilder(state).buildClarityAssessmentPrompt();

    const response = await this.callLLM(systemPrompt);
    const clarityData = this.parseJSONResponse(response);
    
    return {
      missionId: '',
      objectiveClarity: clarityData.objectiveClarity,
      successMetrics: clarityData.successMetrics,
      timelineDefinition: clarityData.timelineDefinition,
      scopeBoundaries: clarityData.scopeBoundaries,
      reasoning: clarityData.reasoning,
      iteration
    };
  }

  /**
   * Generate focused question based on clarity assessment
   */
  private async generateFocusedQuestion(state: MissionChatState, _clarity: MissionClarityModel, isFirstIteration: boolean = false): Promise<string> {
    const systemPrompt = new MissionPromptBuilder(state).buildClarityQuestionPrompt(isFirstIteration);

    return await this.callLLM(systemPrompt);
  }

  /**
   * Generate completion summary when clarity threshold is met
   */
  private async generateCompletionSummary(state: MissionChatState, _clarity: MissionClarityModel, isFirstIteration: boolean = false): Promise<string> {
    const systemPrompt = new MissionPromptBuilder(state).buildClarityCompletionPrompt(isFirstIteration);

    return await this.callLLM(systemPrompt);
  }

  /**
   * Get clarity from database
   */
  private async getClarityFromDB(missionId: string): Promise<MissionClarityModel | null> {
    try {
      const clarityRepo = new MissionClarityRepository();
      return await clarityRepo.getByMissionId(missionId);
    } catch (error) {
      this.logger.error('Failed to get clarity from database', { missionId, error });
      return null;
    }
  }

  /**
   * Parse JSON response from LLM
   */
  private parseJSONResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      
      const parsed = JSON.parse(jsonStr);
      this.validateClarity(parsed);
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse JSON response', { response: response.substring(0, 200), error });
      
      return {
        objectiveClarity: 5,
        successMetrics: 5,
        timelineDefinition: 5,
        scopeBoundaries: 5,
        visionAlignment: 5,
        reasoning: 'Unable to parse AI assessment, using default scores'
      };
    }
  }

  /**
   * Validate clarity assessment structure
   */
  private validateClarity(clarity: any): void {
    const requiredFields = ['objectiveClarity', 'successMetrics', 'timelineDefinition', 'scopeBoundaries', 'visionAlignment', 'reasoning'];
    const errors: string[] = [];
    
    for (const field of requiredFields) {
      if (clarity[field] === undefined) {
        errors.push(`Missing field: ${field}`);
      }
    }
    
    const scoreFields = requiredFields.slice(0, 5);
    for (const field of scoreFields) {
      const score = clarity[field];
      if (typeof score !== 'number' || score < 0 || score > 10) {
        errors.push(`Invalid score for ${field}: must be number 0-10, got ${score}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Clarity validation failed: ${errors.join(', ')}`);
    }
  }

  // ============================================================================
  // WORKFLOW APPROVAL METHODS
  // ============================================================================

  /**
   * Classify user intent regarding workflow approval
   */
  private async classifyWorkflowApprovalIntent(message: string, state: MissionChatState): Promise<WorkflowApprovalIntent> {
    try {
      const promptBuilder = new MissionPromptBuilder(state);
      const prompt = promptBuilder.buildWorkflowApprovalIntentPrompt(message);
      
      const response = await this.callLLM(prompt.messages[0].content);
      const result = this.parseWorkflowApprovalResponse(response);
      
      return result;
    } catch (error) {
      this.logger.error('Failed to classify workflow approval intent', { message: message.substring(0, 100), error });

      return {
        intent: 'unclear',
        confidence: 0.0,
        reasoning: 'Error during intent classification'
      };
    }
  }

  /**
   * Process workflow approval intent
   */
  private async processWorkflowApprovalIntent(
    intent: WorkflowApprovalIntent,
    message: string,
    taskCount: number
  ): Promise<WorkflowApprovalResult> {
    const confidenceThreshold = 0.6;
    const isHighConfidence = intent.confidence >= confidenceThreshold;

    switch (intent.intent) {
      case 'approve':
        if (isHighConfidence) {
          return {
            shouldUpdate: true,
            newStatus: 'approved',
            responseMessage: `✅ **Workflow Approved!**\n\nPerfect! I understand you've approved the execution plan. I'm now preparing to execute the workflow with ${taskCount} tasks.\n\n🚀 **Starting Execution...**\nI'll begin executing each task sequentially and keep you updated on the progress.`
          };
        } else {
          return {
            shouldUpdate: false,
            responseMessage: `I think you might want to approve this workflow, but I want to make sure. Could you please confirm:\n\n**To proceed with execution**, please respond with "yes" or "approve"\n**To make changes**, please respond with "no" or "revise"\n\nWhat would you like to do?`
          };
        }

      case 'reject':
        if (isHighConfidence) {
          return {
            shouldUpdate: true,
            newStatus: 'rejected',
            rejectionReason: `Rejected via natural language: ${message}`,
            responseMessage: `🔄 **Workflow Revision Requested**\n\nI understand you'd like me to revise the execution plan. Let me regenerate the workflow based on your feedback.\n\n⚙️ **Generating Updated Plan...**\nI'll create a new workflow that better addresses your requirements.`
          };
        } else {
          return {
            shouldUpdate: false,
            responseMessage: `I think you might want to revise this workflow, but I want to make sure. Could you please confirm:\n\n**To approve and execute**, please respond with "yes" or "approve"\n**To request changes**, please respond with "no" or "revise"\n\nWhat would you like to do?`
          };
        }

      case 'discussion':
        return {
          shouldUpdate: false,
          responseMessage: undefined
        };

      case 'unclear':
      default:
        return {
          shouldUpdate: false,
          responseMessage: `I'm not sure whether you want to approve this workflow or request changes. To help me understand:\n\n**To approve and execute**, please respond with "approve", "yes", or "let's do it"\n**To request changes**, please respond with "reject", "no", or "revise"\n**To discuss details**, feel free to ask specific questions\n\nWhat would you like to do?`
        };
    }
  }

  /**
   * Parse workflow approval response from LLM
   */
  private parseWorkflowApprovalResponse(response: string): WorkflowApprovalIntent {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      
      const parsed = JSON.parse(jsonStr);
      
      if (!parsed.intent || !['approve', 'reject', 'discussion', 'unclear'].includes(parsed.intent)) {
        throw new Error('Invalid intent value');
      }
      
      const confidence = typeof parsed.confidence === 'number' ? 
        Math.max(0, Math.min(1, parsed.confidence)) : 0.0;
      
      return {
        intent: parsed.intent,
        confidence,
        reasoning: parsed.reasoning || 'No reasoning provided'
      };
      
    } catch (error) {
      this.logger.error('Failed to parse workflow approval response', { 
        response: response.substring(0, 200), 
        error 
      });
      
      return {
        intent: 'unclear',
        confidence: 0.0,
        reasoning: 'Failed to parse intent classification response'
      };
    }
  }
}