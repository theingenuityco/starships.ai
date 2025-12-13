import { ScheduleRepository } from '@starships/models';
import type { ScheduleModel } from '@starships/protocol';
import { CronExpressionParser } from 'cron-parser';
import { getScheduledRunsQueue, type ScheduledRunJobData } from '@/queues/scheduledRunsQueue';

/**
 * ScheduleService
 *
 * Thin service over ScheduleRepository plus orchestration to
 * materialize due schedules as new conversations.
 */
export class ScheduleService {
  private readonly repo: ScheduleRepository;

  // Hardening defaults
  private readonly defaultBatchSize = 50;
  private readonly defaultPerStarshipLimit = 10;

  constructor() {
    this.repo = new ScheduleRepository();
  }

  async createSchedule(data: {
    starshipId: string;
    agentId: string;
    ownerUserId: string;
    prompt: string;
    cronExpression: string;
    timezone: string;
    nextRunAt: string;
    isActive: boolean;
    isRecurring?: boolean;
    endsAt?: string | null;
    maxOccurrences?: number | null;
  }): Promise<ScheduleModel> {
    return this.repo.create(data);
  }

  async getScheduleById(id: string): Promise<ScheduleModel | null> {
    return this.repo.findById(id);
  }

  async listStarshipSchedules(starshipId: string): Promise<ScheduleModel[]> {
    return this.repo.findByStarship(starshipId);
  }

  async updateSchedule(id: string, updates: Partial<ScheduleModel>): Promise<ScheduleModel | null> {
    return this.repo.update(id, updates);
  }

  async deactivateSchedule(id: string): Promise<ScheduleModel | null> {
    return this.repo.update(id, { isActive: false });
  }

  /**
   * Run due schedules:
   * - Hardening:
   *   - Uses repository-level claiming to enforce at-most-once processing.
   *   - Applies per-starship caps to avoid draining a single wallet.
   *   - Isolates failures per-schedule so one bad row doesn't block others.
   *
   * Queue-based execution:
   * - Instead of executing schedules inline, this method now enqueues jobs onto
   *   the Redis-backed "scheduled-runs" queue.
   * - A separate worker process consumes those jobs and materializes them as
   *   conversations/messages.
   *
   * Recurring behavior:
   * - When schedule.isRecurring is true, we compute a new nextRunAt from the
   *   cronExpression and reactivate the schedule after each run.
   * - For now we interpret cron expressions in UTC; the stored timezone is
   *   preserved for future, more advanced semantics.
   */
  async runDueSchedules(options?: {
    now?: Date;
    batchSize?: number;
    perStarshipLimit?: number;
  }): Promise<{ processed: number; skippedByLimit: number; errors: number }> {
    const now = options?.now ?? new Date();
    const batchSize = options?.batchSize ?? this.defaultBatchSize;
    const perStarshipLimit = options?.perStarshipLimit ?? this.defaultPerStarshipLimit;

    const queue = getScheduledRunsQueue();

    const due = await this.repo.findDue(now, batchSize);
    if (!due.length) {
      return { processed: 0, skippedByLimit: 0, errors: 0 };
    }

    const perStarshipCounts = new Map<string, number>();
    let processed = 0;
    let skippedByLimit = 0;
    let errors = 0;

    for (const schedule of due) {
      const currentCount = perStarshipCounts.get(schedule.starshipId) ?? 0;
      if (currentCount >= perStarshipLimit) {
        skippedByLimit += 1;
        continue;
      }

      try {
        // Claim schedule atomically; if null, another worker already claimed it or it was updated.
        const claimed = await this.repo.claimDueSchedule(schedule.id, now);
        if (!claimed) {
          continue;
        }

        // Enqueue a job for the worker to materialize the scheduled run.
        // Older rows may not have ownerUserId populated; in that case we
        // cannot safely execute under a specific user's JWT context, so
        // skip enqueueing and log for visibility.
        if (!claimed.ownerUserId) {
          console.error('[ScheduleService] Skipping schedule without ownerUserId', {
            scheduleId: claimed.id,
          });
          continue;
        }

        const jobData: ScheduledRunJobData = {
          scheduleId: claimed.id,
          starshipId: claimed.starshipId,
          agentId: claimed.agentId,
          prompt: claimed.prompt,
          timezone: claimed.timezone,
          ownerUserId: claimed.ownerUserId,
        };

        await queue.add('scheduled-run', jobData, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 30_000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        });

        // Compute recurrence, if enabled.
        let updates: Partial<ScheduleModel> = {};

        // Increment run count for both one-shot and recurring schedules.
        const previousRunCount = typeof claimed.runCount === 'number' ? claimed.runCount : 0;
        const newRunCount = previousRunCount + 1;

        if (claimed.isRecurring) {
          try {
            const interval = CronExpressionParser.parse(claimed.cronExpression, {
              currentDate: now,
              tz: claimed.timezone || 'UTC',
            });
            const rawNext = interval.next();
            const nextDate = new Date(rawNext.toString());

            let shouldContinue = true;

            // Apply max-occurrence cap if present.
            if (typeof claimed.maxOccurrences === 'number' && claimed.maxOccurrences > 0 && newRunCount >= claimed.maxOccurrences) {
              shouldContinue = false;
            }

            // Apply end date boundary if present (stop once the *next* run would be after endsAt).
            if (shouldContinue && claimed.endsAt) {
              const endsAtDate = new Date(claimed.endsAt);
              if (!Number.isNaN(endsAtDate.getTime()) && nextDate > endsAtDate) {
                shouldContinue = false;
              }
            }

            if (shouldContinue) {
              updates = {
                ...updates,
                nextRunAt: nextDate.toISOString(),
                isActive: true,
              };
            } else {
              // Do not set a new nextRunAt; leave schedule inactive so it stops recurring.
              updates = {
                ...updates,
                isActive: false,
              };
            }
          } catch (e: unknown) {
            // If cron parsing fails, fall back to one-shot semantics:
            // keep the schedule deactivated and log the error.
            console.error('[ScheduleService] Failed to compute nextRunAt for recurring schedule', {
              scheduleId: claimed.id,
              cronExpression: claimed.cronExpression,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // Persist updated run count.
        updates = {
          ...updates,
          runCount: newRunCount,
        };

        // Best-effort linkage for idempotency/debugging and recurrence updates.
        await this.repo.update(claimed.id, updates);

        perStarshipCounts.set(claimed.starshipId, currentCount + 1);
        processed += 1;
      } catch (err) {
        // Hardening: log and continue; a bad schedule shouldn't block others.
        console.error('[ScheduleService] Failed to process schedule', {
          scheduleId: schedule.id,
          error: err instanceof Error ? err.message : String(err),
        });
        errors += 1;
      }
    }

    return { processed, skippedByLimit, errors };
  }
}

export default ScheduleService;
