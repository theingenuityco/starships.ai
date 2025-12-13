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
  /**
   * The user who created/owns this schedule.
   *
   * This field may be null/undefined for legacy rows created before
   * ownership tracking was introduced; new schedules should always
   * populate it.
   */
  ownerUserId?: string | null;
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
  /**
   * Optional upper bound on when this schedule is allowed to compute future
   * nextRunAt values. Once the next candidate run would be after endsAt,
   * the schedule will stop recurring.
   */
  endsAt?: string | null;
  /**
   * Optional cap on how many times this schedule should run in total.
   * When the runCount reaches maxOccurrences, the schedule will stop recurring.
   */
  maxOccurrences?: number | null;
  /**
   * Number of completed runs so far. This is maintained by the server and
   * exposed for debugging and UI display; clients should treat it as readonly.
   */
  runCount?: number;
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
  /**
   * Optional end conditions for recurring schedules. For one-shot schedules,
   * these are ignored by the backend.
   */
  endsAt?: string | null;
  maxOccurrences?: number | null;
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
  endsAt?: string | null;
  maxOccurrences?: number | null;
}
