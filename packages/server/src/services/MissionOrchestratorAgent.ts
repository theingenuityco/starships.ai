/**
 * Mission Orchestrator Agent - Basic AI Response Generation
 * 
 * Provides intelligent responses for mission guidance and coordination
 * using basic LangChain integration with mission context awareness.
 */

import { StateGraph, END, START, Annotation, MemorySaver, MessagesAnnotation } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { LangChainProvider } from '@starships/agent-engine/src/llm/langchain-provider';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import { MissionEventService } from './MissionEventService';
import { MissionPromptBuilder } from '../prompts/MissionPromptBuilder';
import { WorkflowService } from './WorkflowService';
import { MissionExecutionEngine } from './MissionExecutionEngine';
import { MissionService } from './MissionService';
import { MISSION_PHASES } from '@starships/protocol';
import { WorkflowParsingService } from './WorkflowParsingService';
import type { 
  Mission, 
  MissionPhase,
  MissionClarity,
  MissionWorkflow,
  CreateMissionClarityRequest,
  CreateWorkflowRequest,
  LLMChatPrompt,
  LLMProvider
} from '@starships/protocol';
import type { LLM, Starship, Vision, Agent } from '@starships/models';

/**
 * Configuration for MissionOrchestratorAgent
 */
export interface MissionOrchestratorAgentConfig {
  temperature?: number;
  maxTokens?: number;
  provider?: 'openai' | 'anthropic';
  model?: string;
}

/**
 * Callbacks for real-time graph execution
 */
export interface GraphExecutionCallbacks {
  onMessageGenerated: (message: AIMessage, nodeId: string, missionId: string) => Promise<void>;
  onPhaseChange?: (newPhase: MissionPhase, missionId: string) => Promise<void>;
  onStateUpdate?: (state: Partial<MissionChatState>) => Promise<void>;
}

/**
 * Mission metadata for AI response generation
 */
interface MissionMetadata {
  mission: Mission;
  starship: Starship;
  vision: Vision;
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
 * Standard MessagesAnnotation pattern with mission context
 * Extends MessagesAnnotation to include mission-specific metadata caching
 */
const MissionChatStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec, // Standard messages handling
  missionId: Annotation<string>(),
  activePhase: Annotation<MissionPhase | undefined>({
    value: (x, y) => y ?? x,
    default: () => undefined
  }),
  isSystemInitiated: Annotation<boolean>({
    value: (x, y) => y ?? x,
    default: () => false
  }),
  metadata: Annotation<MissionMetadata | null>({
    value: (x, y) => y ?? x,
    default: () => null
  }),
  
  // ADDED: Current clarity for context and iteration tracking
  clarity: Annotation<MissionClarity | undefined>({
    value: (x, y) => y ?? x,
    default: () => undefined
  }),
  
  // ADDED: Workflow data in state
  workflow: Annotation<MissionWorkflow | undefined>({
    value: (x, y) => y ?? x,
    default: () => undefined
  })
});

/**
 * Properly typed state interface for better type safety
 * Combines MessagesAnnotation.State with mission-specific fields
 */
export type MissionChatState = typeof MessagesAnnotation.State & {
  missionId: string;
  activePhase: MissionPhase | undefined;
  isSystemInitiated: boolean;
  metadata: MissionMetadata | null;
  clarity: MissionClarity | undefined; // ADDED: Mission clarity state
  workflow: MissionWorkflow | undefined; // ADDED: Mission workflow state
};

/**
 * MissionOrchestratorAgent - Generates intelligent AI responses for mission coordination
 */
export class MissionOrchestratorAgent {
  private logger: Logger;
  private llmProvider: LLMProvider | null = null;
  private checkpointer = new MemorySaver();
  private compiledGraph: any = null; // Cache compiled graph
  
  // Callback storage for real-time execution
  private currentCallbacks?: GraphExecutionCallbacks;
  private currentMissionId?: string;
  
  // Clarity assessment configuration constants
  private static readonly CLARITY_THRESHOLD = 7.5;
  private static readonly MAX_CLARITY_ITERATIONS = 10;
  
  private readonly config: Required<MissionOrchestratorAgentConfig> = {
    temperature: 0.9,
    maxTokens: 1000,
    provider: 'openai',
    model: 'gpt-4'
  };

  constructor(config?: Partial<MissionOrchestratorAgentConfig>) {
    this.logger = Logger.getInstance();
    
    // Merge provided config with defaults
    if (config) {
      Object.assign(this.config, config);
    }

  }

  /**
   * Get cached compiled graph (compile once, reuse many times)
   */
  private async getGraph() {
    if (!this.compiledGraph) {
      this.compiledGraph = new StateGraph(MissionChatStateAnnotation)
        .addNode("context_builder", this.contextBuilderNode.bind(this))
        .addNode("welcome_phase", this.welcomePhaseNode.bind(this))
        .addNode("analysis_phase", this.analysisPhaseNode.bind(this))
        .addNode("plan_phase", this.planPhaseNode.bind(this))
        .addNode("execute_phase", this.executePhaseNode.bind(this))
        .addNode("converse_phase", this.conversePhaseNode.bind(this))
        .addEdge(START, "context_builder")
        .addConditionalEdges(
          "context_builder",
          this.phaseRouterNode.bind(this),
          {
            welcome: "welcome_phase",
            analysis: "analysis_phase",
            plan: "plan_phase",
            execute: "execute_phase",
            converse: "converse_phase"
          }
        )
        .addConditionalEdges(
          "welcome_phase",
          this.shouldContinueFromWelcome.bind(this),
          {
            continue: "analysis_phase",
            end: END
          }
        )
        .addConditionalEdges(
          "analysis_phase", 
          this.shouldContinueFromAnalysis.bind(this),
          {
            continue: "analysis_phase", // Stay in analysis for iterative questions
            advance: "plan_phase",      // NEW: Move to plan when analysis complete
            end: END
          }
        )
        .addConditionalEdges(
          "plan_phase",
          this.shouldContinueFromPlan.bind(this),
          {
            execute: "execute_phase",    // Plan approved → execute
            regenerate: "plan_phase",    // Plan rejected → stay in plan
            end: END
          }
        )
        .addEdge("execute_phase", "converse_phase")  // Execute → converse
        .addEdge("converse_phase", END)
        .compile({ checkpointer: this.checkpointer });
    }
    
    return this.compiledGraph;
  }

  /**
   * Build mission context - loads metadata and sets current phase
   */
  private async contextBuilderNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    const updates: Partial<MissionChatState> = {};
    
    // Always reload metadata to get fresh mission phase
    if (!state.missionId) {
      throw new Error('missionId is required in state');
    }
    
    const metadata = await this.loadMissionMetadata(state.missionId);
    updates.metadata = metadata;
    
    // Set active phase from mission phase
    updates.activePhase = metadata.mission.phase;
    
    // Load existing workflow from database if not already in state
    if (!state.workflow) {
      const existingWorkflow = await WorkflowService.getWorkflowByMissionId(state.missionId);
      if (existingWorkflow) {
        updates.workflow = existingWorkflow;
      }
    }
    
    return updates;
  }


  /**
   * Create AIMessage with Commander ARIA name
   */
  private createAIMessage(content: string, state: MissionChatState): AIMessage {
    return new AIMessage({ 
      content,
      name: `Commander ARIA-${state.missionId.slice(-4)}`
    });
  }


  /**
   * Create HumanMessage
   */
  private createHumanMessage(content: string): HumanMessage {
    return new HumanMessage({ content });
  }


  /**
   * Conditional edge function to determine phase routing
   */
  private phaseRouterNode(state: MissionChatState): string {
    return state.activePhase || MISSION_PHASES.WELCOME; // Returns current phase or default to welcome
  }

  /**
   * Decide if welcome should auto-continue to analysis
   */
  private shouldContinueFromWelcome(state: MissionChatState): string {
    // Auto-continue from welcome to analysis if it's a system-initiated welcome
    if (state.isSystemInitiated) {
      return 'continue';
    }
    return 'end';
  }

  /**
   * Decide analysis phase continuation - always end to wait for human response
   */
  private shouldContinueFromAnalysis(state: MissionChatState): string {
    const clarity = state.clarity;
    
    if (!clarity) {
      return 'end'; // Something went wrong, stop
    }
    
    // If clarity threshold met OR max iterations reached, advance to plan
    if (clarity.overallScore >= MissionOrchestratorAgent.CLARITY_THRESHOLD || 
        clarity.iteration >= MissionOrchestratorAgent.MAX_CLARITY_ITERATIONS) {
      return 'advance'; // Move to plan_phase
    }
    
    // Always end after generating a question to wait for human response
    return 'end'; // Wait for user to respond, then they'll send another message
  }

  /**
   * Conditional routing from plan phase - uses LLM-based intent classification
   */
  private shouldContinueFromPlan(state: MissionChatState): string {
    const workflow = state.workflow;
    
    if (!workflow) return 'end';
    
    // Check explicit approval status first
    if (workflow.approvalStatus === 'approved') {
      return 'execute'; // → execute_phase
    }
    
    if (workflow.approvalStatus === 'rejected') {
      return 'regenerate'; // → plan_phase (regenerate)
    }
    
    // For pending workflows, the LLM-based intent classification 
    // will be handled in planPhaseNode, which updates the workflow status
    // This routing method just checks the final status
    return 'end'; // pending - wait for user input and intent classification
  }

  /**
   * Welcome phase node - handles initial mission introduction
   */
  private async welcomePhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    // Build welcome prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildWelcomePrompt();

    const prompt: LLMChatPrompt = { messages: [{ role: 'system', content: systemPrompt }] };
    const responseContent = await this.callLLM(prompt);
    
    const aiMessage = this.createAIMessage(responseContent, state);
    
    // Save message immediately via callback
    if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
      await this.currentCallbacks.onMessageGenerated(aiMessage, 'welcome_phase', this.currentMissionId);
    }
    
    // Set activePhase to signal transition to analysis after welcome
    return { 
      messages: [aiMessage],
      activePhase: MISSION_PHASES.ANALYSIS
    };
  }

  /**
   * Interactive Analysis phase node - handles mission clarity assessment with human-in-the-loop Q&A
   * Processes user responses and generates next question or completion when threshold is met
   */
  private async analysisPhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    // Assess current clarity (includes all conversation context including any new user answers)
    const clarity = await this.assessAndSaveClarity(state);
    
    // Check if this is the first analysis iteration (show transparency)
    const isFirstIteration = clarity.iteration === 1;
    
    // Check if analysis is complete
    const isComplete = clarity.overallScore >= MissionOrchestratorAgent.CLARITY_THRESHOLD || 
                      clarity.iteration >= MissionOrchestratorAgent.MAX_CLARITY_ITERATIONS;
    

    const updatedState = {...state, clarity};

    if (isComplete) {
      // Generate completion summary - analysis is done
      const summary = await this.generateCompletionSummary(updatedState, clarity, isFirstIteration);
      const aiMessage = this.createAIMessage(summary, updatedState);
      
      // Save completion message immediately
      if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
        await this.currentCallbacks.onMessageGenerated(aiMessage, 'analysis_complete', this.currentMissionId);
      }
      
      return {
        messages: [aiMessage],
        clarity,
        activePhase: MISSION_PHASES.PLAN // Transition to plan phase
      };
    } else {
      // Generate next question and END - wait for human response
      const question = await this.generateFocusedQuestion(updatedState, clarity, isFirstIteration);
      const aiMessage = this.createAIMessage(question, updatedState);
      
      // Save analysis question immediately
      if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
        await this.currentCallbacks.onMessageGenerated(aiMessage, 'analysis_question', this.currentMissionId);
      }
      
      return {
        messages: [aiMessage],
        clarity
        // Stay in analysis phase - graph will END and wait for user response
      };
    }
  }

  /**
   * Plan phase node - handles plan generation and presentation
   */
  private async planPhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    try {
      const { metadata, clarity } = state;
      
      if (!metadata) throw new Error('Missing metadata in state');
      
      // Get workflow from state or generate new one
      let workflow = state.workflow;
      
      if (!workflow || state.isSystemInitiated || workflow.approvalStatus === 'rejected') {
        // Generate new workflow (first time, system-initiated, or after rejection)
        workflow = await this.generateWorkflow(metadata.mission.id, state);
        
        // Update mission phase in database to reflect transition
        const missionRepo = RepositoryFactory.getMissionRepository();
        await missionRepo.updateMission(metadata.mission.id, { phase: MISSION_PHASES.PLAN });
      } else if (workflow.approvalStatus === 'pending') {
        // Use internal workflow approval methods for natural language detection
        const recentMessage = state.messages[state.messages.length - 1];
        if (recentMessage && recentMessage.content && typeof recentMessage.content === 'string') {
          // Classify user intent using internal method
          const intent = await this.classifyWorkflowApprovalIntent(recentMessage.content, state);
          
          // Process the intent and get required actions
          const taskCount = workflow.nodes.filter(n => n.type === 'agent').length;
          const approvalResult = await this.processWorkflowApprovalIntent(intent, recentMessage.content, taskCount);
          
          // Update workflow status if required
          if (approvalResult.shouldUpdate && approvalResult.newStatus) {
            const workflowService = await import('./WorkflowService');
            await workflowService.WorkflowService.updateWorkflowApproval(metadata.mission.id, {
              approvalStatus: approvalResult.newStatus,
              ...(approvalResult.rejectionReason && { rejectionReason: approvalResult.rejectionReason })
            });
            workflow = { ...workflow, approvalStatus: approvalResult.newStatus };
          }
          
          // Only return early for clarification messages (when status is NOT updated)
          // For approval/rejection, let LangGraph routing handle phase transitions
          if (approvalResult.responseMessage && !approvalResult.shouldUpdate) {
            const aiMessage = this.createAIMessage(approvalResult.responseMessage, state);
            
            // Save message via callback
            if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
              await this.currentCallbacks.onMessageGenerated(aiMessage, 'plan_approval_processing', this.currentMissionId);
            }
            
            return {
              messages: [aiMessage],
              workflow,
              activePhase: MISSION_PHASES.PLAN,
              metadata: {
                ...metadata,
                mission: { ...metadata.mission, phase: MISSION_PHASES.PLAN }
              }
            };
          }
          
          // If workflow was approved/rejected, don't send message here - let routing handle it
          if (approvalResult.shouldUpdate) {
            // Update the workflow in state and continue to routing logic
            // The routing will see the updated status and transition to appropriate phase
          }
        }
      }
      
      // Present workflow for approval (only for pending workflows)
      // Approved workflows will be handled by execute phase routing
      if (workflow.approvalStatus === 'pending') {
        const prompt = new MissionPromptBuilder({ ...state, workflow }).buildWorkflowPresentationPrompt(workflow);
        const responseContent = await this.callLLM(prompt);
        
        console.log('[Workflow Presentation] LLM Response:', responseContent);
        
        const aiMessage = this.createAIMessage(responseContent, state);
        
        // Save message via callback
        if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
          await this.currentCallbacks.onMessageGenerated(aiMessage, 'plan_phase', this.currentMissionId);
        }
        
        return {
          messages: [aiMessage],
          workflow,
          activePhase: MISSION_PHASES.PLAN,
          metadata: {
            ...metadata,
            mission: { ...metadata.mission, phase: MISSION_PHASES.PLAN }
          }
        };
      }
      
      // For approved/rejected workflows, return minimal state and let routing handle transitions
      return {
        messages: [],
        workflow,
        activePhase: MISSION_PHASES.PLAN,
        metadata: {
          ...metadata,
          mission: { ...metadata.mission, phase: MISSION_PHASES.PLAN }
        }
      };
    } catch (error) {
      this.logger.error('Plan phase failed', { error });
      return { activePhase: MISSION_PHASES.ANALYSIS, isSystemInitiated: true };
    }
  }

  /**
   * Execute phase node - runs the approved workflow
   */
  private async executePhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    const { workflow, missionId } = state;
    
    if (!workflow || workflow.approvalStatus !== 'approved') {
      const message = "⚠️ Workflow must be approved before execution can begin.";
      return { 
        messages: [this.createAIMessage(message, state)],
        activePhase: MISSION_PHASES.PLAN 
      };
    }

    try {
      const agentTaskCount = workflow.nodes.filter(n => n.type === 'agent').length;
      const message = `🚀 Starting mission execution with ${agentTaskCount} tasks...\n\nI'll run each task sequentially and keep you updated on the progress. This may take a few minutes depending on the complexity of the tasks.`;
      
      // Save initial message
      if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
        await this.currentCallbacks.onMessageGenerated(
          this.createAIMessage(message, state), 
          'execute_start', 
          this.currentMissionId
        );
      }

      // Start execution in background (don't await - let it run async)
      this.startMissionExecution(missionId, workflow);
      
      return { 
        messages: [this.createAIMessage(message, state)],
        activePhase: MISSION_PHASES.EXECUTE
      };
    } catch (error) {
      const message = `❌ Failed to start mission execution: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return { 
        messages: [this.createAIMessage(message, state)],
        activePhase: MISSION_PHASES.PLAN
      };
    }
  }

  /**
   * Start mission execution in background
   */
  private async startMissionExecution(missionId: string, workflow: MissionWorkflow): Promise<void> {
    try {
      const executionEngine = new MissionExecutionEngine();
      const result = await executionEngine.executeWorkflow(missionId, workflow);
      
      // Update mission phase to converse after execution
      await MissionService.updateMission(missionId, {
        phase: MISSION_PHASES.CONVERSE
      });
      
      // Send completion message
      const completionMessage = result.success
        ? `✅ **Mission execution completed successfully!**\n\n${result.summary}\n\n🎯 **What's next?**\nYou can now ask me questions about the results, request additional analysis, or start a new mission. How can I help you make the most of these results?`
        : `❌ **Mission execution encountered issues**\n\n${result.summary}\n\n🔧 **Next steps:**\n- Review the failed tasks above\n- Consider modifying the plan to address the issues\n- Or ask me to regenerate the workflow\n\nWhat would you like to do?`;
        
      // Send system message via orchestrator service
      const { MissionOrchestratorService } = await import('./MissionOrchestratorService');
      const orchestratorService = MissionOrchestratorService.getInstance();
      await orchestratorService.handleSystemMessage(missionId, completionMessage);
      
    } catch (error) {
      this.logger.error('Background mission execution failed', { missionId }, error as Error);
      
      const errorMessage = `❌ **Mission execution encountered a critical error**\n\nError: ${error instanceof Error ? error.message : 'Unknown system error'}\n\n🔧 **Recovery options:**\n- Try regenerating the workflow plan\n- Check agent assignments and availability\n- Contact support if the issue persists\n\nHow would you like to proceed?`;
      
      const { MissionOrchestratorService } = await import('./MissionOrchestratorService');
      const orchestratorService = MissionOrchestratorService.getInstance();
      await orchestratorService.handleSystemMessage(missionId, errorMessage);
    }
  }

  /**
   * Converse phase node - handles ongoing mission conversation
   */
  private async conversePhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    // Build converse prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildConversePrompt();

    const prompt: LLMChatPrompt = { messages: [{ role: 'system', content: systemPrompt }] };
    const responseContent = await this.callLLM(prompt);
    
    const aiMessage = this.createAIMessage(responseContent, state);
    
    // Save converse message immediately
    if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
      await this.currentCallbacks.onMessageGenerated(aiMessage, 'converse_phase', this.currentMissionId);
    }
    
    return { messages: [aiMessage] };
  }

  /**
   * Generate plan using dedicated services
   */
  private async generateWorkflow(missionId: string, state: MissionChatState): Promise<MissionWorkflow> {
    // Get available agents
    const agents = await this.getAssignedAgents(missionId);
    
    // Build workflow generation prompt
    const prompt = new MissionPromptBuilder(state).buildWorkflowGenerationPrompt(agents);
    
    // Generate workflow using AI
    const aiResponse = await this.callLLM(prompt);
    
    console.log('[Workflow Generation] LLM Response:', aiResponse);
    
    // Parse using dedicated parsing service
    const createRequest = WorkflowParsingService.parseAIResponse(aiResponse, missionId, agents);
    
    // Save using service
    return await WorkflowService.createWorkflow(createRequest);
  }

  /**
   * Get agents assigned to mission with proper error handling
   */
  private async getAssignedAgents(missionId: string): Promise<Agent[]> {
    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      const mission = await missionRepo.getMissionById(missionId);
      
      if (!mission.agentIds || mission.agentIds.length === 0) {
        throw new Error('No agents assigned to mission');
      }

      const agentRepo = RepositoryFactory.getAgentRepository();
      const agents: Agent[] = [];
      
      for (const agentId of mission.agentIds) {
        const agent = await agentRepo.findById(agentId);
        if (agent) {
          agents.push(agent);
        } else {
          this.logger.warn('Agent not found', { agentId, missionId });
        }
      }
      
      if (agents.length === 0) {
        throw new Error('No valid agents found for mission');
      }
      
      return agents;
    } catch (error) {
      this.logger.error('Failed to get assigned agents', {
        service: 'MissionOrchestratorAgent',
        operation: 'getAssignedAgents',
        missionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Load mission metadata once per conversation (replaces buildMissionContext)
   */
  private async loadMissionMetadata(missionId: string): Promise<MissionMetadata> {
    try {
      // Step 1: Get mission first to access starshipId
      const missionRepo = RepositoryFactory.getMissionRepository();
      const mission = await missionRepo.getMissionById(missionId);

      // Step 2: Validate required data
      if (!mission.starshipId) {
        this.logger.error('Mission has no associated starship', {
          missionId,
          mission: { id: mission.id, name: mission.name }
        });
        throw new Error(`Mission ${missionId} has no associated starship`);
      }

      // Step 3: Get repositories following existing patterns  
      const starshipRepo = RepositoryFactory.getStarshipRepository();
      const visionRepo = RepositoryFactory.getVisionRepository();

      // Step 4: Parallel fetch with proper error context
      const [starship, vision] = await Promise.all([
        starshipRepo.findById(mission.starshipId),
        visionRepo.findByStarship(mission.starshipId)
      ]);

      // Step 5: Validate all required data exists
      if (!starship) {
        this.logger.error('Starship not found', {
          starshipId: mission.starshipId,
          missionName: mission.name
        });
        throw new Error(`Starship not found: ${mission.starshipId}`);
      }

      if (!vision) {
        this.logger.error('Vision not found for starship', {
          starshipId: mission.starshipId,
          starshipName: starship.name
        });
        throw new Error(`Vision not found for starship: ${mission.starshipId}`);
      }

      const metadata: MissionMetadata = {
        mission,
        starship,
        vision
      };

      return metadata;

    } catch (error) {
      this.logger.error('Failed to load mission metadata', error as Error);
      throw error;
    }
  }

  /**
   * Generate AI response using LangGraph flow - returns both response and final state
   */
  async generateResponseWithState(message: string, missionId: string): Promise<{ response: string; state: Partial<MissionChatState> }> {
    try {
      const graph = await this.getGraph();
      const threadId = `mission-${missionId}`;
      
      // Create user message and let LangGraph handle the flow
      const userMessage = new HumanMessage({ content: message });
      
      // Invoke the graph - it will handle context building, phase routing, and response generation
      const result = await graph.invoke(
        { 
          missionId,
          messages: [userMessage]
        },
        { configurable: { thread_id: threadId } }
      );

      // Extract final AI response from the graph result
      const lastMessage = result.messages[result.messages.length - 1];
      const response = lastMessage instanceof AIMessage && typeof lastMessage.content === 'string' 
        ? lastMessage.content 
        : this.getFallbackResponse(missionId);

      return { response, state: result };

    } catch (error) {
      this.logger.error('Failed to generate orchestrator response', {
        service: 'MissionOrchestratorAgent',
        operation: 'generateResponseWithState',
        missionId
      }, error as Error);
      
      throw error;
    }
  }

  /**
   * Execute graph with real-time callbacks for immediate message saving
   */
  async executeGraphWithCallbacks(
    missionId: string, 
    input: string, 
    callbacks: GraphExecutionCallbacks,
    isSystemMessage: boolean = false
  ): Promise<{ finalResponse: string; state: Partial<MissionChatState> }> {
    try {
      // Store callbacks and missionId for use in nodes
      this.currentCallbacks = callbacks;
      this.currentMissionId = missionId;

      const graph = await this.getGraph();
      const threadId = `mission-${missionId}`;
      
      const inputMessage = isSystemMessage 
        ? new SystemMessage({ content: input })
        : new HumanMessage({ content: input });
      
      const result = await graph.invoke(
        { 
          missionId,
          messages: [inputMessage],
          isSystemInitiated: isSystemMessage
        },
        { configurable: { thread_id: threadId } }
      );

      // Extract final response
      const lastMessage = result.messages[result.messages.length - 1];
      const finalResponse = lastMessage instanceof AIMessage && typeof lastMessage.content === 'string' 
        ? lastMessage.content 
        : this.getFallbackResponse(missionId);

      // Clear callback storage
      this.currentCallbacks = undefined;
      this.currentMissionId = undefined;

      return { finalResponse, state: result };

    } catch (error) {
      // Clear callback storage on error
      this.currentCallbacks = undefined;
      this.currentMissionId = undefined;

      this.logger.error('Failed to execute graph with callbacks', {
        service: 'MissionOrchestratorAgent',
        operation: 'executeGraphWithCallbacks',
        missionId
      }, error as Error);
      
      throw error;
    }
  }

  /**
   * Generate AI response using LangGraph flow - respects graph state transitions
   */
  async generateResponse(message: string, missionId: string): Promise<string> {
    try {
      const graph = await this.getGraph();
      const threadId = `mission-${missionId}`;
      
      // Create user message and let LangGraph handle the flow
      const userMessage = new HumanMessage({ content: message });
      
      // Invoke the graph - it will handle context building, phase routing, and response generation
      const result = await graph.invoke(
        { 
          missionId,
          messages: [userMessage]
        },
        { configurable: { thread_id: threadId } }
      );

      // Extract final AI response from the graph result
      const lastMessage = result.messages[result.messages.length - 1];
      if (lastMessage instanceof AIMessage) {
        return typeof lastMessage.content === 'string' ? lastMessage.content : '';
      }

      return this.getFallbackResponse(missionId);

    } catch (error) {
      this.logger.error('Failed to generate orchestrator response', {
        service: 'MissionOrchestratorAgent',
        operation: 'generateResponse',
        missionId
      }, error as Error);
      return this.getFallbackResponse(missionId);
    }
  }



  /**
   * Generate system-initiated response with state - returns both response and final state
   */
  async generateSystemResponseWithState(missionId: string, message: string): Promise<{ response: string; state: Partial<MissionChatState> }> {
    try {
      const graph = await this.getGraph();
      const threadId = `mission-${missionId}`;
      
      const systemMessage = new SystemMessage({ 
        content: message
      });
      
      const result = await graph.invoke(
        { 
          missionId,
          messages: [systemMessage],
          isSystemInitiated: true
        },
        { configurable: { thread_id: threadId } }
      );

      const lastMessage = result.messages[result.messages.length - 1];
      const response = lastMessage instanceof AIMessage && typeof lastMessage.content === 'string' 
        ? lastMessage.content 
        : this.getFallbackResponse(missionId);

      return { response, state: result };

    } catch (error) {
      this.logger.error('Failed to generate system response', error as Error);
      throw error;
    }
  }

  /**
   * Generate system-initiated response (no user input required)
   */
  async generateSystemResponse(missionId: string, message: string): Promise<string> {
    try {
      const graph = await this.getGraph();
      const threadId = `mission-${missionId}`;
      
      const systemMessage = new SystemMessage({ 
        content: message
      });
      
      const result = await graph.invoke(
        { 
          missionId,
          messages: [systemMessage],
          isSystemInitiated: true
        },
        { configurable: { thread_id: threadId } }
      );

      const lastMessage = result.messages[result.messages.length - 1];
      if (lastMessage instanceof AIMessage) {
        return typeof lastMessage.content === 'string' ? lastMessage.content : '';
      }

      return this.getFallbackResponse(missionId);

    } catch (error) {
      this.logger.error('Failed to generate system response', error as Error);
      return this.getFallbackResponse(missionId);
    }
  }


  /**
   * Call LLM provider for response generation
   */
  private async callLLM(prompt: LLMChatPrompt): Promise<string> {
    // Initialize LLM provider if not already done
    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    if (!this.llmProvider) {
      throw new Error('LLM provider not initialized');
    }

    console.log({ prompt: prompt.messages[0] })

    const result = await this.llmProvider.complete(prompt, {
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens
    });

    console.log('[LLM Response]:', result.reply);

    return result.reply;
  }

  /**
   * Initialize LLM provider with default model configuration
   */
  private async initializeLLMProvider(): Promise<void> {
    try {
      // Create a basic LLM configuration
      // TODO: Load from database configuration when available
      const llmConfig: LLM = {
        id: 'default-mission-orchestrator',
        name: this.config.model,
        provider: this.config.provider,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        createdAt: new Date().toISOString()
      };

      this.llmProvider = new LangChainProvider(llmConfig);


    } catch (error) {
      this.logger.error('Failed to initialize LLM provider', {
        service: 'MissionOrchestratorAgent',
        operation: 'initializeLLMProvider'
      }, error as Error);
      throw error;
    }
  }


  /**
   * Generate fallback response when LLM fails
   */
  private getFallbackResponse(_missionId: string): string {
    return `I'm here to help guide your mission. Could you provide more details about what you need assistance with?`;
  }


  // ============================================================================
  // WORKFLOW APPROVAL METHODS
  // ============================================================================

  /**
   * Classify user intent regarding workflow approval using LLM
   */
  private async classifyWorkflowApprovalIntent(message: string, state: MissionChatState): Promise<WorkflowApprovalIntent> {
    try {
      // Use MissionPromptBuilder to build the prompt with proper context
      const promptBuilder = new MissionPromptBuilder(state);
      const prompt = promptBuilder.buildWorkflowApprovalIntentPrompt(message);
      
      const response = await this.callLLM(prompt);
      const result = this.parseWorkflowApprovalResponse(response);
      
      this.logger.debug('Workflow approval intent classified', {
        service: 'MissionOrchestratorAgent',
        operation: 'classifyWorkflowApprovalIntent',
        message: message.substring(0, 100),
        result
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to classify workflow approval intent', {
        service: 'MissionOrchestratorAgent',
        operation: 'classifyWorkflowApprovalIntent',
        message: message.substring(0, 100)
      }, error as Error);

      // Fallback to unclear with low confidence
      return {
        intent: 'unclear',
        confidence: 0.0,
        reasoning: 'Error during intent classification'
      };
    }
  }

  /**
   * Process workflow approval intent and determine necessary actions
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
          responseMessage: undefined // Let normal conversation flow handle this
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
   * Parse intent classification response from LLM
   */
  private parseWorkflowApprovalResponse(response: string): WorkflowApprovalIntent {
    try {
      // Extract JSON from response if wrapped in text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      
      const parsed = JSON.parse(jsonStr);
      
      // Validate structure
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
        service: 'MissionOrchestratorAgent',
        operation: 'parseWorkflowApprovalResponse',
        response: response.substring(0, 200)
      }, error as Error);
      
      // Return unclear with low confidence on parse failure
      return {
        intent: 'unclear',
        confidence: 0.0,
        reasoning: 'Failed to parse intent classification response'
      };
    }
  }

  // ============================================================================
  // CLARITY ASSESSMENT METHODS
  // ============================================================================

  /**
   * Main orchestrator method - assesses clarity and saves to database
   */
  private async assessAndSaveClarity(state: MissionChatState): Promise<MissionClarity> {
    try {
      // Get current iteration count
      const currentClarity = await this.getClarityFromDB(state.missionId);
      const iteration = (currentClarity?.iteration || 0) + 1;
      
      // Update state with current clarity for context (convert null to undefined)
      const stateWithClarity = { ...state, clarity: currentClarity || undefined };
      
      // Assess clarity using AI with full context
      const clarityRequest = await this.assessMissionClarity(stateWithClarity, iteration);
      clarityRequest.missionId = state.missionId; // Set the mission ID
      
      // Save to database
      const clarityRepo = RepositoryFactory.getMissionClarityRepository();
      const updatedClarity = await clarityRepo.upsertByMissionId(state.missionId, clarityRequest);
      
      // Emit real-time clarity update
      const missionEventService = MissionEventService.getInstance();
      missionEventService.emitClarityUpdate(state.missionId, updatedClarity);
      
      return updatedClarity;
    } catch (error) {
      this.logger.error('Failed to assess and save clarity', {
        service: 'MissionOrchestratorAgent',
        operation: 'assessAndSaveClarity',
        missionId: state.missionId
      }, error as Error);
      throw error;
    }
  }

  /**
   * AI clarity assessment using LLM - returns structured clarity data
   * Uses full context (including existing clarity data) via buildContext
   */
  private async assessMissionClarity(state: MissionChatState, iteration: number): Promise<CreateMissionClarityRequest> {
    // Build clarity assessment prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildClarityAssessmentPrompt();

    const prompt: LLMChatPrompt = {
      messages: [{
        role: 'system',
        content: systemPrompt
      }]
    };

    const response = await this.callLLM(prompt);
    const clarityData = this.parseJSONResponse(response);
    
    return {
      missionId: '', // Will be set by caller
      objectiveClarity: clarityData.objectiveClarity,
      successMetrics: clarityData.successMetrics,
      timelineDefinition: clarityData.timelineDefinition,
      scopeBoundaries: clarityData.scopeBoundaries,
      visionAlignment: clarityData.visionAlignment,
      reasoning: clarityData.reasoning,
      iteration
    };
  }

  /**
   * Generate focused question based on clarity assessment
   */
  private async generateFocusedQuestion(state: MissionChatState, _clarity: MissionClarity, isFirstIteration: boolean = false): Promise<string> {
    // Build clarity question prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildClarityQuestionPrompt(isFirstIteration);

    const prompt: LLMChatPrompt = {
      messages: [{
        role: 'system', 
        content: systemPrompt
      }]
    };

    return await this.callLLM(prompt);
  }

  /**
   * Generate completion summary when clarity threshold is met
   */
  private async generateCompletionSummary(state: MissionChatState, _clarity: MissionClarity, isFirstIteration: boolean = false): Promise<string> {
    // Build clarity completion prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildClarityCompletionPrompt(isFirstIteration);

    const prompt: LLMChatPrompt = {
      messages: [{
        role: 'system',
        content: systemPrompt
      }]
    };

    return await this.callLLM(prompt);
  }

  /**
   * Get clarity from database for iteration tracking
   */
  private async getClarityFromDB(missionId: string): Promise<MissionClarity | null> {
    try {
      const clarityRepo = RepositoryFactory.getMissionClarityRepository();
      return await clarityRepo.getByMissionId(missionId);
    } catch (error) {
      this.logger.error('Failed to get clarity from database', {
        service: 'MissionOrchestratorAgent',
        operation: 'getClarityFromDB',
        missionId
      }, error as Error);
      return null;
    }
  }


  /**
   * Parse JSON response from LLM with error handling
   */
  private parseJSONResponse(response: string): any {
    try {
      // Extract JSON from response if wrapped in text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      
      const parsed = JSON.parse(jsonStr);
      this.validateClarity(parsed);
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse JSON response', {
        service: 'MissionOrchestratorAgent',
        operation: 'parseJSONResponse',
        response: response.substring(0, 200)
      }, error as Error);
      
      // Return default scores if parsing fails
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
   * Validate clarity assessment structure and ranges
   */
  private validateClarity(clarity: any): void {
    const requiredFields = ['objectiveClarity', 'successMetrics', 'timelineDefinition', 'scopeBoundaries', 'visionAlignment', 'reasoning'];
    const errors: string[] = [];
    
    for (const field of requiredFields) {
      if (clarity[field] === undefined) {
        errors.push(`Missing field: ${field}`);
      }
    }
    
    // Validate score ranges (0-10)
    const scoreFields = requiredFields.slice(0, 5); // First 5 are scores
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
}