import { getConnection } from '../connection';
import { 
  ExpeditionTask, 
  ExpeditionTaskRepository as ExpeditionTaskRepositoryInterface,
  TaskStatus,
  TaskPriority
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based expedition task repository
 * 
 * Handles all database operations for expedition tasks including CRUD operations,
 * agent assignments, dependency management, and task execution tracking.
 */
export class ExpeditionTaskRepository implements ExpeditionTaskRepositoryInterface {
  
  /**
   * Find all tasks (admin use only)
   */
  async findAll(): Promise<ExpeditionTask[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ t: ExpeditionTask }>(
      'MATCH (t:ExpeditionTask) RETURN t ORDER BY t.createdAt DESC'
    );
    return result.map(record => record.t);
  }

  /**
   * Find task by ID
   */
  async findById(id: string): Promise<ExpeditionTask | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ t: ExpeditionTask }>(
      'MATCH (t:ExpeditionTask) WHERE t.id = $id RETURN t',
      { id }
    );
    return result[0]?.t || null;
  }

  /**
   * Find all tasks for a specific expedition
   */
  async findByExpedition(expeditionId: string): Promise<ExpeditionTask[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ t: ExpeditionTask }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_TASK]->(t:ExpeditionTask)
       RETURN t ORDER BY t.createdAt ASC`,
      { expeditionId }
    );
    return result.map(record => record.t);
  }

  /**
   * Find tasks by status for an expedition
   */
  async findByStatus(expeditionId: string, status: TaskStatus): Promise<ExpeditionTask[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ t: ExpeditionTask }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_TASK]->(t:ExpeditionTask)
       WHERE t.status = $status
       RETURN t ORDER BY t.createdAt ASC`,
      { expeditionId, status }
    );
    return result.map(record => record.t);
  }

  /**
   * Find all tasks assigned to a specific agent
   */
  async findByAgent(agentId: string): Promise<ExpeditionTask[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ t: ExpeditionTask }>(
      `MATCH (a:Agent {id: $agentId})-[:ASSIGNED_TO]->(t:ExpeditionTask)
       RETURN t ORDER BY t.createdAt DESC`,
      { agentId }
    );
    return result.map(record => record.t);
  }

  /**
   * Find tasks by priority for an expedition
   */
  async findByPriority(expeditionId: string, priority: TaskPriority): Promise<ExpeditionTask[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ t: ExpeditionTask }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_TASK]->(t:ExpeditionTask)
       WHERE t.priority = $priority
       RETURN t ORDER BY t.createdAt ASC`,
      { expeditionId, priority }
    );
    return result.map(record => record.t);
  }

  /**
   * Create a new task
   */
  async create(entity: Omit<ExpeditionTask, 'id' | 'createdAt'>): Promise<ExpeditionTask> {
    const connection = getConnection();
    const now = new Date().toISOString();
    
    const task: ExpeditionTask = {
      ...entity,
      id: uuidv4(),
      createdAt: now,
      updatedAt: entity.updatedAt || now,
      status: entity.status || 'pending',
      priority: entity.priority || 'medium',
      requiredSkills: entity.requiredSkills || [],
      dependencies: entity.dependencies || []
    };

    // Create task node
    await connection.executeWrite(
      'CREATE (t:ExpeditionTask $props) RETURN t',
      { props: task }
    );

    // Create relationship with expedition
    await connection.executeWrite(
      `MATCH (e:Expedition {id: $expeditionId}), (t:ExpeditionTask {id: $taskId})
       CREATE (e)-[:HAS_TASK {createdAt: $timestamp}]->(t)`,
      {
        expeditionId: task.expeditionId,
        taskId: task.id,
        timestamp: task.createdAt
      }
    );

    // Create dependency relationships if any
    if (task.dependencies.length > 0) {
      for (const depId of task.dependencies) {
        await connection.executeWrite(
          `MATCH (t1:ExpeditionTask {id: $taskId}), (t2:ExpeditionTask {id: $depId})
           CREATE (t1)-[:DEPENDS_ON {createdAt: $timestamp}]->(t2)`,
          {
            taskId: task.id,
            depId,
            timestamp: task.createdAt
          }
        );
      }
    }

    return task;
  }

  /**
   * Update a task
   */
  async update(id: string, updates: Partial<ExpeditionTask>): Promise<ExpeditionTask | null> {
    const connection = getConnection();
    const updateProps = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const result = await connection.executeWrite<{ t: ExpeditionTask }>(
      'MATCH (t:ExpeditionTask) WHERE t.id = $id SET t += $updates RETURN t',
      { id, updates: updateProps }
    );

    return result[0]?.t || null;
  }

  /**
   * Delete a task
   */
  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (t:ExpeditionTask) WHERE t.id = $id 
       DETACH DELETE t 
       RETURN count(t) as deletedCount`,
      { id }
    );

    return result[0]?.deletedCount > 0;
  }

  /**
   * Assign a task to an agent
   */
  async assignToAgent(taskId: string, agentId: string): Promise<ExpeditionTask | null> {
    const connection = getConnection();
    
    const result = await connection.executeWrite<{ t: ExpeditionTask }>(
      `MATCH (t:ExpeditionTask {id: $taskId}), (a:Agent {id: $agentId})
       SET t.assignedAgentId = $agentId, t.status = 'assigned', t.updatedAt = $timestamp
       CREATE (a)-[:ASSIGNED_TO {assignedAt: $timestamp}]->(t)
       RETURN t`,
      {
        taskId,
        agentId,
        timestamp: new Date().toISOString()
      }
    );

    return result[0]?.t || null;
  }

  /**
   * Update task status
   */
  async updateStatus(taskId: string, status: TaskStatus): Promise<ExpeditionTask | null> {
    const connection = getConnection();
    
    const result = await connection.executeWrite<{ t: ExpeditionTask }>(
      `MATCH (t:ExpeditionTask) WHERE t.id = $taskId 
       SET t.status = $status, t.updatedAt = $timestamp 
       RETURN t`,
      { 
        taskId, 
        status, 
        timestamp: new Date().toISOString() 
      }
    );

    return result[0]?.t || null;
  }

  /**
   * Update task result
   */
  async updateResult(taskId: string, result: string): Promise<ExpeditionTask | null> {
    const connection = getConnection();
    
    const updateResult = await connection.executeWrite<{ t: ExpeditionTask }>(
      `MATCH (t:ExpeditionTask) WHERE t.id = $taskId 
       SET t.result = $result, t.updatedAt = $timestamp 
       RETURN t`,
      { 
        taskId, 
        result, 
        timestamp: new Date().toISOString() 
      }
    );

    return updateResult[0]?.t || null;
  }

  /**
   * Get task dependencies (tasks this task depends on)
   */
  async getDependencies(taskId: string): Promise<ExpeditionTask[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ dep: ExpeditionTask }>(
      `MATCH (t:ExpeditionTask {id: $taskId})-[:DEPENDS_ON]->(dep:ExpeditionTask)
       RETURN dep ORDER BY dep.createdAt ASC`,
      { taskId }
    );
    return result.map(record => record.dep);
  }

  /**
   * Get task dependents (tasks that depend on this task)
   */
  async getDependents(taskId: string): Promise<ExpeditionTask[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ dependent: ExpeditionTask }>(
      `MATCH (dependent:ExpeditionTask)-[:DEPENDS_ON]->(t:ExpeditionTask {id: $taskId})
       RETURN dependent ORDER BY dependent.createdAt ASC`,
      { taskId }
    );
    return result.map(record => record.dependent);
  }

  /**
   * Get tasks that are ready for execution (all dependencies completed)
   */
  async getTasksReadyForExecution(expeditionId: string): Promise<ExpeditionTask[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ t: ExpeditionTask }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_TASK]->(t:ExpeditionTask)
       WHERE t.status = 'pending'
       AND NOT EXISTS {
         MATCH (t)-[:DEPENDS_ON]->(dep:ExpeditionTask)
         WHERE dep.status <> 'completed'
       }
       RETURN t ORDER BY t.priority DESC, t.createdAt ASC`,
      { expeditionId }
    );
    return result.map(record => record.t);
  }

  /**
   * Get task statistics for an expedition
   */
  async getTaskStats(expeditionId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
  }> {
    const connection = getConnection();
    
    const result = await connection.executeQuery<{
      total: number;
      pending: number;
      assigned: number;
      inProgress: number;
      blocked: number;
      review: number;
      completed: number;
      failed: number;
    }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_TASK]->(t:ExpeditionTask)
       WITH count(t) as total,
            count(CASE WHEN t.status = 'pending' THEN 1 END) as pending,
            count(CASE WHEN t.status = 'assigned' THEN 1 END) as assigned,
            count(CASE WHEN t.status = 'in-progress' THEN 1 END) as inProgress,
            count(CASE WHEN t.status = 'blocked' THEN 1 END) as blocked,
            count(CASE WHEN t.status = 'review' THEN 1 END) as review,
            count(CASE WHEN t.status = 'completed' THEN 1 END) as completed,
            count(CASE WHEN t.status = 'failed' THEN 1 END) as failed
       RETURN total, pending, assigned, inProgress, blocked, review, completed, failed`,
      { expeditionId }
    );

    const rawStats = result[0];
    
    // Handle case where no results are returned
    if (!rawStats) {
      return {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        failed: 0
      };
    }

    // Convert BigInt values to numbers
    const totalNum = Number(rawStats.total);
    const pendingNum = Number(rawStats.pending);
    const assignedNum = Number(rawStats.assigned);
    const inProgressNum = Number(rawStats.inProgress);
    const blockedNum = Number(rawStats.blocked);
    const reviewNum = Number(rawStats.review);
    const completedNum = Number(rawStats.completed);
    const failedNum = Number(rawStats.failed);

    return {
      total: totalNum,
      pending: pendingNum + assignedNum, // Combine pending and assigned
      inProgress: inProgressNum + blockedNum + reviewNum, // Combine active states
      completed: completedNum,
      failed: failedNum
    };
  }

  /**
   * Delete all tasks for an expedition
   */
  async deleteByExpedition(expeditionId: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_TASK]->(t:ExpeditionTask)
       DETACH DELETE t
       RETURN count(t) as deletedCount`,
      { expeditionId }
    );

    return result[0]?.deletedCount > 0;
  }
}