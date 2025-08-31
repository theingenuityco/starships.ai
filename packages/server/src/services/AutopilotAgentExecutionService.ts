/**
 * Autopilot Agent Execution Service
 * 
 * Replaces AgentExecutionService with autopilot-based agent execution.
 * Handles both simple chat and complex workflow-based agents.
 */

import { RepositoryFactory } from '@starships/models';
import type { ChatRequest, ChatResponse } from '@starships/protocol';
import { AutopilotAgentAdapter } from '../adapters/AutopilotAgentAdapter';

export class AutopilotAgentExecutionService {
  /**
   * Execute agent chat using autopilot system
   */
  static async executeChat(request: ChatRequest): Promise<ChatResponse> {
    const { agent_id, user_id, message, session_id } = request;

    if (!agent_id) {
      throw new Error('agent_id is required for agent chat');
    }

    console.log('🚀 [AUTOPILOT-EXECUTION] Starting autopilot agent chat:', {
      agent_id,
      user_id,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      session_id,
      timestamp: new Date().toISOString(),
    });

    // Get agent from database
    const agentRepo = RepositoryFactory.getAgentRepository();
    const dbAgent = await agentRepo.findById(agent_id);

    if (!dbAgent) {
      console.error('❌ [AUTOPILOT-EXECUTION] Agent not found:', agent_id);
      throw new Error(`Agent ${agent_id} not found`);
    }

    console.log('✅ [AUTOPILOT-EXECUTION] Database agent loaded:', {
      id: dbAgent.id,
      name: dbAgent.name,
      model: dbAgent.model,
      executionMode: dbAgent.executionMode || 'simple',
      hasBlueprint: !!dbAgent.blueprint,
      starshipId: dbAgent.starshipId,
    });

    try {
      // Validate agent configuration
      const validation = AutopilotAgentAdapter.validateAgentConfig(dbAgent);
      if (!validation.valid) {
        throw new Error(`Invalid agent configuration: ${validation.errors.join(', ')}`);
      }

      // Create autopilot agent through adapter
      const autopilotAgent = await AutopilotAgentAdapter.fromDatabaseAgent(dbAgent, {
        includeMemory: true,
        userId: user_id,
        sessionId: session_id,
        loadConversationHistory: true
      });

      console.log('✅ [AUTOPILOT-EXECUTION] Autopilot agent created successfully');

      // Add current user message to agent memory
      autopilotAgent.addToMemory('user', message);

      // Execute agent workflow
      console.log('⚙️ [AUTOPILOT-EXECUTION] Executing agent workflow...');
      const executionStart = Date.now();
      
      const executionResult = await autopilotAgent.execute();
      
      const executionTime = Date.now() - executionStart;
      console.log(`⏱️ [AUTOPILOT-EXECUTION] Workflow completed in ${executionTime}ms`);

      // Extract response from execution result
      const responseContent = AutopilotAgentAdapter.extractResponse(executionResult);
      
      // Calculate usage statistics
      const usageStats = AutopilotAgentAdapter.calculateUsage(executionResult);

      // Save conversation history back to database
      await AutopilotAgentAdapter.saveConversationHistory(
        autopilotAgent.getMemory(),
        agent_id,
        user_id
      );

      console.log('✅ [AUTOPILOT-EXECUTION] Chat execution completed successfully:', {
        responseLength: responseContent.length,
        executionTime,
        usageStats
      });

      return {
        source: 'agent',
        content: responseContent,
        agent_id: agent_id,
        usage: usageStats
      };

    } catch (error) {
      console.error('❌ [AUTOPILOT-EXECUTION] Agent execution failed:', {
        agent_id,
        user_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      // Fallback to simple error response
      const fallbackResponse = this.generateFallbackResponse(dbAgent, error);
      
      return {
        source: 'agent',
        content: fallbackResponse,
        agent_id: agent_id,
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0
        }
      };
    }
  }

  /**
   * Generate fallback response when agent execution fails
   */
  private static generateFallbackResponse(dbAgent: any, error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    console.log('🔄 [AUTOPILOT-EXECUTION] Generating fallback response for agent:', dbAgent.name);

    // Generate appropriate fallback based on agent category
    switch (dbAgent.category) {
      case 'coding':
        return "I'm experiencing technical difficulties right now, but I'm here to help with your coding questions. Could you please rephrase your request?";
      case 'creative':
        return "I'm having trouble accessing my creative processes at the moment. Please try again, and I'll do my best to help with your creative needs.";
      case 'analysis':
        return "I'm currently unable to perform detailed analysis. Please try your request again, and I'll help you analyze your data or situation.";
      case 'support':
        return "I'm experiencing some technical issues, but I'm committed to helping you. Could you please try rephrasing your question?";
      default:
        return `I apologize, but I'm experiencing some technical difficulties right now. Please try your request again, and I'll do my best to assist you.`;
    }
  }

  /**
   * Get execution statistics for monitoring
   */
  static getExecutionStats(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
  } {
    // TODO: Implement execution statistics tracking
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0
    };
  }

  /**
   * Get memory store instance for backward compatibility
   */
  static getMemoryStore() {
    return AutopilotAgentAdapter.getMemoryStore();
  }

  /**
   * Test agent configuration without executing
   */
  static async validateAgent(agentId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const agentRepo = RepositoryFactory.getAgentRepository();
      const dbAgent = await agentRepo.findById(agentId);

      if (!dbAgent) {
        return {
          valid: false,
          errors: [`Agent ${agentId} not found`],
          warnings: []
        };
      }

      const validation = AutopilotAgentAdapter.validateAgentConfig(dbAgent);
      
      const warnings: string[] = [];
      
      // Add warnings for potential issues
      if (!dbAgent.blueprint && dbAgent.executionMode === 'workflow') {
        warnings.push('Agent is set to workflow mode but has no blueprint defined');
      }
      
      if (!dbAgent.systemPrompt) {
        warnings.push('Agent has no system prompt defined');
      }

      if (!dbAgent.starshipId) {
        warnings.push('Agent is not assigned to any starship');
      }

      return {
        valid: validation.valid,
        errors: validation.errors,
        warnings
      };

    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        warnings: []
      };
    }
  }
}