/**
 * Schedule Domain Types
 *
 * Represents scheduled agent runs that materialize as new conversations.
 */

/**
 * Core schedule model - database entity
 *
 * NOTE: This is intentionally 1:1 with the schedules table schema
 * (camelCase here, snake_case in the database via serialization-helper).
 */
export interface ScheduleModel {
  id: string;
  starshipId: string;
  agentId: string;
  prompt: string;
  cronExpression: string;
  timezone: string;
  nextRunAt: string;
  isActive: boolean;
  lastRunAt?: string | null;
  lastRunConversationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request payload for creating a schedule.
 * Mirrors ScheduleModel minus server-generated fields.
 */
export interface CreateScheduleRequest {
  starshipId: string;
  agentId: string;
  prompt: string;
  cronExpression: string;
  timezone: string;
  nextRunAt: string;
  isActive: boolean;
}

/**
 * Request payload for updating a schedule.
 */
export interface UpdateScheduleRequest {
  prompt?: string;
  cronExpression?: string;
  timezone?: string;
  nextRunAt?: string;
  isActive?: boolean;
}


