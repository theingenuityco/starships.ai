import { produce } from 'immer';
import { ExecutionState } from '@/types/execution';

export interface TransformOperation {
  operation: 'add' | 'replace' | 'remove' | 'copy' | 'move' | 'test';
  path: string;
  value?: any;
  from?: string;
}

export class ParallelStateManager {
  private stateVersions: Map<number, ExecutionState> = new Map();
  private pendingMutations: Map<string, TransformOperation[]> = new Map();
  private mutationLocks: Map<string, Promise<void>> = new Map();
  
  /**
   * Apply mutations with stage-level batching
   * All mutations from parallel nodes in same stage are collected and applied atomically
   */
  async applyMutations(
    state: ExecutionState,
    nodeRef: string,
    mutations: TransformOperation[],
    stageIndex: number
  ): Promise<ExecutionState> {
    // Queue mutations for this node
    this.pendingMutations.set(nodeRef, mutations);
    
    // Wait for stage completion before applying
    return this.commitStageMutations(state, stageIndex);
  }
  
  /**
   * Queue mutations for a node (non-blocking)
   */
  queueMutations(nodeRef: string, mutations: TransformOperation[]): void {
    const existing = this.pendingMutations.get(nodeRef) || [];
    this.pendingMutations.set(nodeRef, [...existing, ...mutations]);
  }
  
  /**
   * Commit all pending mutations for a stage atomically
   */
  async commitStageMutations(
    state: ExecutionState,
    stageIndex: number
  ): Promise<ExecutionState> {
    // If no pending mutations, return state as-is
    if (this.pendingMutations.size === 0) {
      return state;
    }
    
    // Use immer for immutable updates
    const newState = produce(state, draft => {
      // Apply all pending mutations in deterministic order
      const sortedNodes = Array.from(this.pendingMutations.keys()).sort();
      
      for (const nodeRef of sortedNodes) {
        const mutations = this.pendingMutations.get(nodeRef)!;
        
        for (const mutation of mutations) {
          try {
            this.applyMutation(draft, mutation);
          } catch (error) {
            console.error(`Failed to apply mutation from node ${nodeRef}:`, error);
            // Continue with other mutations
          }
        }
      }
    });
    
    // Store state version for debugging/rollback
    this.stateVersions.set(stageIndex, newState);
    
    // Clear pending mutations
    this.pendingMutations.clear();
    
    return newState;
  }
  
  private applyMutation(draft: any, mutation: TransformOperation): void {
    const pathParts = mutation.path.split('/').filter(Boolean);
    
    switch (mutation.operation) {
      case 'add':
        if (pathParts[pathParts.length - 1] === '-') {
          // Array append
          const arrayPath = pathParts.slice(0, -1);
          const target = this.resolvePath(draft, arrayPath);
          if (Array.isArray(target)) {
            target.push(mutation.value);
          } else {
            throw new Error(`Target at path ${arrayPath.join('/')} is not an array`);
          }
        } else {
          // Set property or array insert
          const parentPath = pathParts.slice(0, -1);
          const parent = this.resolvePath(draft, parentPath);
          const key = pathParts[pathParts.length - 1];
          
          if (Array.isArray(parent)) {
            const index = parseInt(key, 10);
            if (!isNaN(index)) {
              parent.splice(index, 0, mutation.value);
            } else {
              throw new Error(`Invalid array index: ${key}`);
            }
          } else {
            this.setPath(draft, pathParts, mutation.value);
          }
        }
        break;
        
      case 'replace':
        this.setPath(draft, pathParts, mutation.value);
        break;
        
      case 'remove':
        const parent = this.resolvePath(draft, pathParts.slice(0, -1));
        const key = pathParts[pathParts.length - 1];
        
        if (Array.isArray(parent)) {
          const index = parseInt(key, 10);
          if (!isNaN(index)) {
            parent.splice(index, 1);
          }
        } else {
          delete parent[key];
        }
        break;
        
      case 'copy':
        if (!mutation.from) {
          throw new Error('Copy operation requires "from" path');
        }
        const sourceParts = mutation.from.split('/').filter(Boolean);
        const sourceValue = this.resolvePath(draft, sourceParts);
        this.setPath(draft, pathParts, JSON.parse(JSON.stringify(sourceValue)));
        break;
        
      case 'move':
        if (!mutation.from) {
          throw new Error('Move operation requires "from" path');
        }
        const moveSourceParts = mutation.from.split('/').filter(Boolean);
        const moveValue = this.resolvePath(draft, moveSourceParts);
        
        // Copy to destination
        this.setPath(draft, pathParts, moveValue);
        
        // Remove from source
        const moveParent = this.resolvePath(draft, moveSourceParts.slice(0, -1));
        const moveKey = moveSourceParts[moveSourceParts.length - 1];
        
        if (Array.isArray(moveParent)) {
          const index = parseInt(moveKey, 10);
          if (!isNaN(index)) {
            moveParent.splice(index, 1);
          }
        } else {
          delete moveParent[moveKey];
        }
        break;
        
      case 'test':
        // Test operation - verify value matches
        const testValue = this.resolvePath(draft, pathParts);
        if (JSON.stringify(testValue) !== JSON.stringify(mutation.value)) {
          throw new Error(`Test failed at path ${mutation.path}: expected ${JSON.stringify(mutation.value)}, got ${JSON.stringify(testValue)}`);
        }
        break;
        
      default:
        console.warn(`Unknown mutation operation: ${mutation.operation}`);
    }
  }
  
  private resolvePath(obj: any, pathParts: string[]): any {
    let current = obj;
    
    for (const part of pathParts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      
      if (Array.isArray(current)) {
        const index = parseInt(part, 10);
        if (!isNaN(index)) {
          current = current[index];
        } else {
          return undefined;
        }
      } else {
        current = current[part];
      }
    }
    
    return current;
  }
  
  private setPath(obj: any, pathParts: string[], value: any): void {
    const parent = pathParts.slice(0, -1).reduce((current, part) => {
      if (!current[part]) {
        // Auto-create intermediate objects
        current[part] = {};
      }
      return current[part];
    }, obj);
    
    const key = pathParts[pathParts.length - 1];
    
    if (Array.isArray(parent)) {
      const index = parseInt(key, 10);
      if (!isNaN(index)) {
        parent[index] = value;
      } else {
        throw new Error(`Cannot set non-numeric key "${key}" on array`);
      }
    } else {
      parent[key] = value;
    }
  }
  
  /**
   * Get state at a specific stage (for debugging/rollback)
   */
  getStateAtStage(stageIndex: number): ExecutionState | undefined {
    return this.stateVersions.get(stageIndex);
  }
  
  /**
   * Get all state versions (for debugging)
   */
  getAllStateVersions(): Map<number, ExecutionState> {
    return new Map(this.stateVersions);
  }
  
  /**
   * Clear all stored state versions
   */
  clearHistory(): void {
    this.stateVersions.clear();
  }
  
  /**
   * Reset manager state
   */
  reset(): void {
    this.stateVersions.clear();
    this.pendingMutations.clear();
    this.mutationLocks.clear();
  }
  
  /**
   * Create a state snapshot
   */
  createSnapshot(state: ExecutionState): string {
    return JSON.stringify(state);
  }
  
  /**
   * Restore from snapshot
   */
  restoreSnapshot(snapshot: string): ExecutionState {
    try {
      return JSON.parse(snapshot);
    } catch (error) {
      throw new Error('Invalid state snapshot');
    }
  }
  
  /**
   * Validate state structure
   */
  validateState(state: ExecutionState): boolean {
    // Basic validation - can be extended
    return state !== null && typeof state === 'object';
  }
  
  /**
   * Get pending mutations (for debugging)
   */
  getPendingMutations(): Map<string, TransformOperation[]> {
    return new Map(this.pendingMutations);
  }
  
  /**
   * Check if there are pending mutations
   */
  hasPendingMutations(): boolean {
    return this.pendingMutations.size > 0;
  }
}