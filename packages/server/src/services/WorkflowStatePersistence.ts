import { RepositoryFactory } from '@starships/models';
import { getLogger, Logger } from '../utils/logger';

interface PersistedCheckpoint {
  id: string;
  threadId: string;
  checkpoint: any;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

export class WorkflowStatePersistence {
  private logger: Logger;
  private expeditionId: string;
  private checkpoints: Map<string, PersistedCheckpoint> = new Map();

  constructor(expeditionId: string) {
    this.logger = getLogger({ service: 'WorkflowStatePersistence' });
    this.expeditionId = expeditionId;
  }

  async getTuple(config: { configurable?: { thread_id?: string } }): Promise<[any, any] | null> {
    try {
      const threadId = config.configurable?.thread_id;
      if (!threadId) {
        return null;
      }

      this.logger.debug('Getting checkpoint tuple', {
        service: 'WorkflowStatePersistence',
        operation: 'getTuple'
      }, {
        expeditionId: this.expeditionId,
        threadId
      });

      const checkpoint = await this.loadCheckpointFromDatabase(threadId);
      if (!checkpoint) {
        return null;
      }

      return [checkpoint.checkpoint, checkpoint.metadata];
    } catch (error) {
      this.logger.error('Failed to get checkpoint tuple', error instanceof Error ? error : new Error(String(error)), {
        service: 'WorkflowStatePersistence',
        operation: 'getTuple'
      });
      return null;
    }
  }

  async list(config: { configurable?: { thread_id?: string } }, limit?: number): Promise<Array<[any, any]>> {
    try {
      const threadId = config.configurable?.thread_id;
      
      this.logger.debug('Listing checkpoints', {
        service: 'WorkflowStatePersistence',
        operation: 'list'
      }, {
        expeditionId: this.expeditionId,
        threadId,
        limit
      });

      const checkpoints = await this.loadAllCheckpointsFromDatabase(threadId);
      const sorted = checkpoints.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const limited = limit ? sorted.slice(0, limit) : sorted;
      return limited.map(cp => [cp.checkpoint, cp.metadata]);
    } catch (error) {
      this.logger.error('Failed to list checkpoints', error instanceof Error ? error : new Error(String(error)), {
        service: 'WorkflowStatePersistence',
        operation: 'list'
      });
      return [];
    }
  }

  async put(config: { configurable?: { thread_id?: string } }, checkpoint: any, metadata: any): Promise<void> {
    try {
      const threadId = config.configurable?.thread_id || `thread-${Date.now()}`;
      
      this.logger.debug('Putting checkpoint', {
        service: 'WorkflowStatePersistence',
        operation: 'put'
      }, {
        expeditionId: this.expeditionId,
        threadId,
        checkpointId: checkpoint.id
      });

      const persisted: PersistedCheckpoint = {
        id: checkpoint.id || `checkpoint-${Date.now()}`,
        threadId,
        checkpoint,
        metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await this.saveCheckpointToDatabase(persisted);
    } catch (error) {
      this.logger.error('Failed to put checkpoint', error instanceof Error ? error : new Error(String(error)), {
        service: 'WorkflowStatePersistence',
        operation: 'put'
      });
      throw error;
    }
  }

  private async loadCheckpointFromDatabase(threadId: string): Promise<PersistedCheckpoint | null> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(this.expeditionId);
      
      if (!expedition || !expedition.workflowState) {
        return null;
      }

      const workflowState = expedition.workflowState;
      if (workflowState.checkpoints && workflowState.checkpoints[threadId]) {
        const checkpoint = workflowState.checkpoints[threadId];
        return {
          id: checkpoint.id,
          threadId: threadId,
          checkpoint: checkpoint.state,
          metadata: checkpoint.metadata || {},
          createdAt: checkpoint.createdAt,
          updatedAt: checkpoint.updatedAt
        };
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to load checkpoint from database', error instanceof Error ? error : new Error(String(error)), {
        service: 'WorkflowStatePersistence',
        operation: 'loadCheckpointFromDatabase'
      });
      return null;
    }
  }

  private async loadAllCheckpointsFromDatabase(threadId?: string): Promise<PersistedCheckpoint[]> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(this.expeditionId);
      
      if (!expedition || !expedition.workflowState || !expedition.workflowState.checkpoints) {
        return [];
      }

      const checkpoints: PersistedCheckpoint[] = [];
      const workflowCheckpoints = expedition.workflowState.checkpoints;

      for (const [tid, checkpoint] of Object.entries(workflowCheckpoints)) {
        if (!threadId || tid === threadId) {
          checkpoints.push({
            id: (checkpoint as any).id,
            threadId: tid,
            checkpoint: (checkpoint as any).state,
            metadata: (checkpoint as any).metadata || {},
            createdAt: (checkpoint as any).createdAt,
            updatedAt: (checkpoint as any).updatedAt
          });
        }
      }

      return checkpoints;
    } catch (error) {
      this.logger.error('Failed to load all checkpoints from database', error instanceof Error ? error : new Error(String(error)), {
        service: 'WorkflowStatePersistence',
        operation: 'loadAllCheckpointsFromDatabase'
      });
      return [];
    }
  }

  private async saveCheckpointToDatabase(checkpoint: PersistedCheckpoint): Promise<void> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(this.expeditionId);
      
      if (!expedition) {
        throw new Error(`Expedition ${this.expeditionId} not found`);
      }

      const workflowState = expedition.workflowState || {};
      workflowState.checkpoints = workflowState.checkpoints || {};
      
      workflowState.checkpoints[checkpoint.threadId] = {
        id: checkpoint.id,
        state: checkpoint.checkpoint,
        metadata: checkpoint.metadata,
        createdAt: checkpoint.createdAt,
        updatedAt: checkpoint.updatedAt
      };

      workflowState.lastCheckpoint = {
        threadId: checkpoint.threadId,
        checkpointId: checkpoint.id,
        timestamp: checkpoint.updatedAt
      };

      await expeditionRepo.updateWorkflowState(this.expeditionId, workflowState);

      this.logger.info('Checkpoint saved to database', {
        service: 'WorkflowStatePersistence',
        operation: 'saveCheckpointToDatabase'
      }, {
        expeditionId: this.expeditionId,
        threadId: checkpoint.threadId,
        checkpointId: checkpoint.id
      });
    } catch (error) {
      this.logger.error('Failed to save checkpoint to database', error instanceof Error ? error : new Error(String(error)), {
        service: 'WorkflowStatePersistence',
        operation: 'saveCheckpointToDatabase'
      });
      throw error;
    }
  }

  async cleanupOldCheckpoints(maxAge: number = 86400000): Promise<void> {
    try {
      this.logger.info('Cleaning up old checkpoints', {
        service: 'WorkflowStatePersistence',
        operation: 'cleanupOldCheckpoints'
      }, {
        expeditionId: this.expeditionId,
        maxAgeMs: maxAge
      });

      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(this.expeditionId);
      
      if (!expedition || !expedition.workflowState || !expedition.workflowState.checkpoints) {
        return;
      }

      const now = Date.now();
      const checkpoints = expedition.workflowState.checkpoints;
      let removedCount = 0;

      for (const [threadId, checkpoint] of Object.entries(checkpoints)) {
        const age = now - new Date((checkpoint as any).updatedAt).getTime();
        if (age > maxAge) {
          delete checkpoints[threadId];
          removedCount++;
        }
      }

      if (removedCount > 0) {
        await expeditionRepo.updateWorkflowState(this.expeditionId, expedition.workflowState);
        
        this.logger.info('Old checkpoints cleaned up', {
          service: 'WorkflowStatePersistence',
          operation: 'cleanupOldCheckpoints'
        }, {
          expeditionId: this.expeditionId,
          removedCount
        });
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old checkpoints', error instanceof Error ? error : new Error(String(error)), {
        service: 'WorkflowStatePersistence',
        operation: 'cleanupOldCheckpoints'
      });
    }
  }
}