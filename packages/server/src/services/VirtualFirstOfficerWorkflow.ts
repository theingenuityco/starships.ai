import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';
import { getLogger, Logger } from '../utils/logger';
import { VirtualFirstOfficer } from './VirtualFirstOfficer';
import { ContextBuilder } from './ContextBuilder';
import { FirstOfficerService } from './FirstOfficerService';
import { ExpeditionStatus, WorkflowPhase } from '@starships/protocol';
import { ExpeditionMessageRepository } from '@starships/models';
// import { WorkflowStatePersistence } from './WorkflowStatePersistence';

interface VFOWorkflowState {
  expeditionId: string;
  starshipId: string;
  userId: string;
  currentPhase: WorkflowPhase;
  userMessage: string;
  context?: any;
  agentResponse?: string;
  semanticSearchResults?: any[];
  error?: string;
  retryCount: number;
  lastUpdated: string;
}

interface VFOWorkflowConfig {
  maxRetries: number;
  enableSemanticSearch: boolean;
  contextRefreshInterval: number;
}

export class VirtualFirstOfficerWorkflow {
  private logger: Logger;
  private config: VFOWorkflowConfig;
  private vfo: VirtualFirstOfficer;
  private contextBuilder: ContextBuilder;
  private nodeHandlers: Map<string, (state: VFOWorkflowState, config?: RunnableConfig) => Promise<Partial<VFOWorkflowState>>>;
  private routingHandlers: Map<string, (state: VFOWorkflowState) => string>;

  constructor(
    vfo: VirtualFirstOfficer,
    contextBuilder: ContextBuilder,
    config?: Partial<VFOWorkflowConfig>
  ) {
    this.logger = getLogger({ service: 'VirtualFirstOfficerWorkflow' });
    this.vfo = vfo;
    this.contextBuilder = contextBuilder;
    
    this.config = {
      maxRetries: 3,
      enableSemanticSearch: true,
      contextRefreshInterval: 60000,
      ...config
    };

    this.nodeHandlers = new Map();
    this.routingHandlers = new Map();
    this.initializeHandlers();
  }

  private initializeHandlers(): void {
    this.nodeHandlers.set('refresh_context', this.refreshContext.bind(this));
    this.nodeHandlers.set('semantic_search', this.performSemanticSearch.bind(this));
    this.nodeHandlers.set('process_message', this.processMessage.bind(this));
    this.nodeHandlers.set('handle_error', this.handleError.bind(this));
    this.nodeHandlers.set('retry_processing', this.retryProcessing.bind(this));
    this.nodeHandlers.set('finalize_response', this.finalizeResponse.bind(this));

    this.routingHandlers.set('route_after_context', this.routeAfterContext.bind(this));
    this.routingHandlers.set('route_after_search', this.routeAfterSearch.bind(this));
    this.routingHandlers.set('route_after_processing', this.routeAfterProcessing.bind(this));
    this.routingHandlers.set('route_after_error', this.routeAfterError.bind(this));
  }

  buildStateGraph(expeditionId: string): any {
    const workflow = new StateGraph<VFOWorkflowState>({
      channels: this.defineStateChannels()
    }) as any;

    this.addWorkflowNodes(workflow);
    this.defineWorkflowEdges(workflow);

    return workflow.compile({
      checkpointer: new MemorySaver()
    });
  }

  private defineStateChannels() {
    return {
      expeditionId: null,
      starshipId: null,
      userId: null,
      currentPhase: null,
      userMessage: null,
      context: null,
      agentResponse: null,
      semanticSearchResults: null,
      error: null,
      retryCount: null,
      lastUpdated: null
    };
  }

  private addWorkflowNodes(workflow: StateGraph<VFOWorkflowState>): void {
    workflow.addNode('refresh_context', this.nodeHandlers.get('refresh_context')!);
    workflow.addNode('semantic_search', this.nodeHandlers.get('semantic_search')!);
    workflow.addNode('process_message', this.nodeHandlers.get('process_message')!);
    workflow.addNode('handle_error', this.nodeHandlers.get('handle_error')!);
    workflow.addNode('retry_processing', this.nodeHandlers.get('retry_processing')!);
    workflow.addNode('finalize_response', this.nodeHandlers.get('finalize_response')!);
  }

  private defineWorkflowEdges(workflow: any): void {
    workflow.addEdge(START, 'refresh_context');
    
    workflow.addConditionalEdges(
      'refresh_context',
      this.routingHandlers.get('route_after_context')!,
      {
        'semantic_search': 'semantic_search',
        'process_message': 'process_message',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'semantic_search',
      this.routingHandlers.get('route_after_search')!,
      {
        'process_message': 'process_message',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'process_message',
      this.routingHandlers.get('route_after_processing')!,
      {
        'finalize_response': 'finalize_response',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'handle_error',
      this.routingHandlers.get('route_after_error')!,
      {
        'retry_processing': 'retry_processing',
        'finalize_response': 'finalize_response'
      }
    );

    workflow.addEdge('retry_processing', 'refresh_context');
    workflow.addEdge('finalize_response', END);
  }

  private async refreshContext(state: VFOWorkflowState): Promise<Partial<VFOWorkflowState>> {
    try {
      this.logger.debug('Refreshing expedition context', {
        service: 'VirtualFirstOfficerWorkflow',
        operation: 'refreshContext'
      }, {
        expeditionId: state.expeditionId
      });

      const contextData = await this.contextBuilder.buildExpeditionContext(state.expeditionId);
      
      // Map ContextBuilder's ExpeditionContext to VirtualFirstOfficer's ExpeditionContext
      const vfoContext = {
        expeditionId: state.expeditionId,
        starshipId: state.starshipId,
        state: contextData.expeditionDetails.status as any,
        title: contextData.expeditionDetails.name,
        objective: contextData.expeditionDetails.mission,
        createdAt: contextData.expeditionDetails.createdAt,
        assignedAgents: contextData.agents.map(agent => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          status: agent.status === 'active' ? 'online' as const : 'offline' as const
        })),
        tasks: contextData.taskSummaries,
        results: [],
        recentMessages: contextData.recentMessages.map(msg => ({
          id: msg.id,
          sender: msg.agentId || msg.userId || 'system',
          content: msg.content,
          timestamp: msg.timestamp,
          type: msg.role === 'user' ? 'user' as const : msg.role === 'agent' ? 'agent' as const : 'system' as const
        })),
        statistics: {
          totalTasks: contextData.statistics.totalTasks,
          completedTasks: contextData.statistics.completedTasks,
          activeTasks: contextData.statistics.inProgressTasks,
          failedTasks: contextData.statistics.failedTasks,
          totalMessages: contextData.statistics.totalMessages,
          averageCompletionTime: contextData.statistics.averageCompletionTime
        }
      };
      
      this.vfo.updateContext(vfoContext);

      return {
        context: vfoContext,
        currentPhase: 'analyzing' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to refresh context', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficerWorkflow',
        operation: 'refreshContext'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to refresh context',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async performSemanticSearch(state: VFOWorkflowState): Promise<Partial<VFOWorkflowState>> {
    try {
      if (!this.config.enableSemanticSearch) {
        return {
          semanticSearchResults: [],
          currentPhase: 'decomposing' as WorkflowPhase
        };
      }

      this.logger.debug('Performing semantic search', {
        service: 'VirtualFirstOfficerWorkflow',
        operation: 'performSemanticSearch'
      }, {
        expeditionId: state.expeditionId,
        query: state.userMessage.substring(0, 100) + '...'
      });

      const searchResult = await this.vfo.performSemanticSearch(state.userMessage, 5);

      return {
        semanticSearchResults: searchResult.relevantMessages,
        currentPhase: 'decomposing' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.warn('Semantic search failed, continuing without results', {
        service: 'VirtualFirstOfficerWorkflow',
        operation: 'performSemanticSearch'
      }, {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        semanticSearchResults: [],
        currentPhase: 'decomposing' as WorkflowPhase
      };
    }
  }

  private async processMessage(state: VFOWorkflowState): Promise<Partial<VFOWorkflowState>> {
    try {
      this.logger.debug('Processing user message through VFO', {
        service: 'VirtualFirstOfficerWorkflow',
        operation: 'processMessage'
      }, {
        expeditionId: state.expeditionId,
        userId: state.userId
      });

      const response = await this.vfo.processMessage(state.userMessage, state.userId);

      return {
        agentResponse: response,
        currentPhase: 'coordinating' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to process message', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficerWorkflow',
        operation: 'processMessage'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to process message',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async handleError(state: VFOWorkflowState): Promise<Partial<VFOWorkflowState>> {
    this.logger.warn('Handling error in workflow', {
      service: 'VirtualFirstOfficerWorkflow',
      operation: 'handleError'
    }, {
      error: state.error,
      retryCount: state.retryCount,
      expeditionId: state.expeditionId
    });

    return {
      retryCount: (state.retryCount || 0) + 1,
      lastUpdated: new Date().toISOString()
    };
  }

  private async retryProcessing(state: VFOWorkflowState): Promise<Partial<VFOWorkflowState>> {
    this.logger.info('Retrying message processing', {
      service: 'VirtualFirstOfficerWorkflow',
      operation: 'retryProcessing'
    }, {
      retryCount: state.retryCount,
      expeditionId: state.expeditionId
    });

    return {
      error: undefined,
      currentPhase: 'analyzing' as WorkflowPhase,
      lastUpdated: new Date().toISOString()
    };
  }

  private async finalizeResponse(state: VFOWorkflowState): Promise<Partial<VFOWorkflowState>> {
    this.logger.info('Finalizing workflow response', {
      service: 'VirtualFirstOfficerWorkflow',
      operation: 'finalizeResponse'
    }, {
      expeditionId: state.expeditionId,
      hasResponse: !!state.agentResponse,
      hasError: !!state.error
    });

    return {
      currentPhase: state.error ? 'failed' as WorkflowPhase : 'completed' as WorkflowPhase,
      lastUpdated: new Date().toISOString()
    };
  }

  private routeAfterContext(state: VFOWorkflowState): string {
    if (state.error) {
      return 'handle_error';
    }
    
    if (this.config.enableSemanticSearch) {
      return 'semantic_search';
    }
    
    return 'process_message';
  }

  private routeAfterSearch(state: VFOWorkflowState): string {
    if (state.error) {
      return 'handle_error';
    }
    
    return 'process_message';
  }

  private routeAfterProcessing(state: VFOWorkflowState): string {
    if (state.error) {
      return 'handle_error';
    }
    
    return 'finalize_response';
  }

  private routeAfterError(state: VFOWorkflowState): string {
    if (state.retryCount < this.config.maxRetries) {
      return 'retry_processing';
    }
    
    return 'finalize_response';
  }

  async executeWorkflow(input: {
    expeditionId: string;
    starshipId: string;
    userId: string;
    userMessage: string;
  }): Promise<{
    response?: string;
    error?: string;
    searchResults?: any[];
  }> {
    try {
      const graph = this.buildStateGraph(input.expeditionId);
      
      const initialState: VFOWorkflowState = {
        ...input,
        currentPhase: 'initializing' as WorkflowPhase,
        retryCount: 0,
        lastUpdated: new Date().toISOString()
      };

      const result = await graph.invoke(initialState, {
        configurable: {
          thread_id: `vfo-${input.expeditionId}-${Date.now()}`
        }
      });

      return {
        response: result.agentResponse,
        error: result.error,
        searchResults: result.semanticSearchResults
      };
    } catch (error) {
      this.logger.error('Workflow execution failed', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficerWorkflow',
        operation: 'executeWorkflow'
      });

      return {
        error: error instanceof Error ? error.message : 'Workflow execution failed'
      };
    }
  }
}