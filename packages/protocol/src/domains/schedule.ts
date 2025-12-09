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
  /**
   * Whether this schedule should automatically compute a new nextRunAt
   * after each run (recurring schedule) or behave as a one-shot.
   *
   * For backwards compatibility, older rows may have this unset at the
   * database level; application code should treat missing/undefined as false.
   */
  isRecurring: boolean;
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
  /**
   * When true, the schedule will compute a new nextRunAt after each run
   * based on cronExpression; when false (or omitted), it will be one-shot.
   */
  isRecurring?: boolean;
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
  isRecurring?: boolean;
}
