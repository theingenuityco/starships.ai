/**
 * Simple State Persistence for LangGraph Workflow
 * 
 * Minimal replacement for WorkflowStatePersistence that works with LangGraph
 */

import { RepositoryFactory } from '@starships/models';
import { FirstOfficerState } from './types';

export class StatePersistence {
  /**
   * Persist workflow state for recovery
   */
  async persistState(expeditionId: string, state: Partial<FirstOfficerState>): Promise<void> {
    console.log(`💾 [STATE-PERSISTENCE] Persisting workflow state for expedition: ${expeditionId}`);
    
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      
      // Convert to ExpeditionWorkflowState format
      const workflowState = {
        expeditionId: state.expeditionId || expeditionId,
        currentPhase: state.currentPhase || 'analyzing',
        requirements: state.requirements || '',
        taskBreakdown: state.taskBreakdown || [],
        agentAssignments: state.agentAssignments || {},
        agentResults: state.agentResults || {},
        userId: state.userId || 'unknown',
        starshipId: state.starshipId || 'unknown', 
        retryCount: state.retryCount || 0,
        errors: state.errors || [],
        finalResult: state.finalResult,
        analysis: state.objectiveAnalysis,
        lastUpdated: new Date().toISOString()
      };
      
      await expeditionRepo.updateWorkflowState(expeditionId, workflowState);
      
      console.log(`✅ [STATE-PERSISTENCE] State persisted for expedition: ${expeditionId}`);
    } catch (error) {
      console.error('❌ [STATE-PERSISTENCE] Failed to persist state:', error);
      throw error;
    }
  }

  /**
   * Recover workflow state from checkpoint
   */
  async recoverState(expeditionId: string): Promise<FirstOfficerState | null> {
    console.log(`📥 [STATE-PERSISTENCE] Recovering workflow state for expedition: ${expeditionId}`);
    
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition || !expedition.workflowState) {
        console.warn(`⚠️ [STATE-PERSISTENCE] No saved state found for expedition: ${expeditionId}`);
        return null;
      }

      const recoveredState = expedition.workflowState as FirstOfficerState;
      
      console.log(`✅ [STATE-PERSISTENCE] State recovered from phase: ${recoveredState.currentPhase}`);
      
      return recoveredState;
    } catch (error) {
      console.error('❌ [STATE-PERSISTENCE] Failed to recover state:', error);
      return null;
    }
  }
}