/**
 * Dependency Resolver for Parallel Task Execution
 * 
 * Analyzes task dependencies and creates execution groups that can run in parallel
 */

import { TaskBreakdown } from '@starships/protocol';

export class DependencyResolver {
  /**
   * Build dependency graph from tasks
   */
  async buildDependencyGraph(tasks: TaskBreakdown[]): Promise<Map<string, string[]>> {
    const graph = new Map<string, string[]>();
    
    tasks.forEach(task => {
      graph.set(task.id, task.dependencies || []);
    });
    
    return graph;
  }

  /**
   * Identify groups of tasks that can be executed in parallel
   */
  identifyParallelGroups(
    tasks: TaskBreakdown[],
    dependencyGraph: Map<string, string[]>
  ): TaskBreakdown[][] {
    const groups: TaskBreakdown[][] = [];
    const visited = new Set<string>();
    const inProgress = new Set<string>();
    
    // Topological sort with level grouping
    const levels = this.topologicalSortWithLevels(tasks, dependencyGraph);
    
    // Convert levels to task groups
    levels.forEach(level => {
      const group = tasks.filter(task => level.includes(task.id));
      if (group.length > 0) {
        groups.push(group);
      }
    });
    
    return groups;
  }

  /**
   * Perform topological sort with level grouping
   */
  private topologicalSortWithLevels(
    tasks: TaskBreakdown[],
    dependencyGraph: Map<string, string[]>
  ): string[][] {
    const levels: string[][] = [];
    const inDegree = new Map<string, number>();
    const taskMap = new Map<string, TaskBreakdown>();
    
    // Initialize in-degree count
    tasks.forEach(task => {
      taskMap.set(task.id, task);
      inDegree.set(task.id, 0);
    });
    
    // Calculate in-degrees
    dependencyGraph.forEach((deps, taskId) => {
      deps.forEach(dep => {
        const current = inDegree.get(dep) || 0;
        inDegree.set(dep, current + 1);
      });
    });
    
    // Find tasks with no dependencies (in-degree = 0)
    let currentLevel = tasks
      .filter(task => (inDegree.get(task.id) || 0) === 0)
      .map(task => task.id);
    
    while (currentLevel.length > 0) {
      levels.push(currentLevel);
      
      const nextLevel: string[] = [];
      
      currentLevel.forEach(taskId => {
        const deps = dependencyGraph.get(taskId) || [];
        
        deps.forEach(dep => {
          const depInDegree = (inDegree.get(dep) || 0) - 1;
          inDegree.set(dep, depInDegree);
          
          if (depInDegree === 0) {
            nextLevel.push(dep);
          }
        });
      });
      
      currentLevel = nextLevel;
    }
    
    return levels;
  }

  /**
   * Detect circular dependencies
   */
  detectCircularDependencies(
    tasks: TaskBreakdown[],
    dependencyGraph: Map<string, string[]>
  ): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[] = [];
    
    const hasCycle = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);
      
      const dependencies = dependencyGraph.get(taskId) || [];
      
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) {
            cycles.push(`${taskId} -> ${dep}`);
            return true;
          }
        } else if (recursionStack.has(dep)) {
          cycles.push(`${taskId} -> ${dep} (circular)`);
          return true;
        }
      }
      
      recursionStack.delete(taskId);
      return false;
    };
    
    tasks.forEach(task => {
      if (!visited.has(task.id)) {
        hasCycle(task.id);
      }
    });
    
    return cycles;
  }

  /**
   * Get critical path (longest dependency chain)
   */
  getCriticalPath(
    tasks: TaskBreakdown[],
    dependencyGraph: Map<string, string[]>
  ): string[] {
    const taskMap = new Map<string, TaskBreakdown>();
    tasks.forEach(task => taskMap.set(task.id, task));
    
    const memo = new Map<string, { duration: number; path: string[] }>();
    
    const getLongestPath = (taskId: string): { duration: number; path: string[] } => {
      if (memo.has(taskId)) {
        return memo.get(taskId)!;
      }
      
      const task = taskMap.get(taskId);
      if (!task) {
        return { duration: 0, path: [] };
      }
      
      const dependencies = dependencyGraph.get(taskId) || [];
      
      if (dependencies.length === 0) {
        const result = {
          duration: task.estimatedEffort || 30,
          path: [taskId]
        };
        memo.set(taskId, result);
        return result;
      }
      
      let maxDuration = 0;
      let longestPath: string[] = [];
      
      dependencies.forEach(dep => {
        const depPath = getLongestPath(dep);
        if (depPath.duration > maxDuration) {
          maxDuration = depPath.duration;
          longestPath = depPath.path;
        }
      });
      
      const result = {
        duration: maxDuration + (task.estimatedEffort || 30),
        path: [...longestPath, taskId]
      };
      
      memo.set(taskId, result);
      return result;
    };
    
    let criticalPath: string[] = [];
    let maxDuration = 0;
    
    tasks.forEach(task => {
      const path = getLongestPath(task.id);
      if (path.duration > maxDuration) {
        maxDuration = path.duration;
        criticalPath = path.path;
      }
    });
    
    return criticalPath;
  }
}