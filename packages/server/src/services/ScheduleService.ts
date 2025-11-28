import { ScheduleRepository } from '@starships/models';
import type { ScheduleModel } from '@starships/protocol';
import { ConversationService } from '@/services/ConversationService';

/**
 * ScheduleService
 *
 * Thin service over ScheduleRepository plus orchestration to
 * materialize due schedules as new conversations.
 */
export class ScheduleService {
  private readonly repo: ScheduleRepository;
  private readonly conversationService: ConversationService;

  // Hardening defaults
  private readonly defaultBatchSize = 50;
  private readonly defaultPerStarshipLimit = 10;

  constructor() {
    this.repo = new ScheduleRepository();
    this.conversationService = new ConversationService();
  }

  async createSchedule(data: {
    starshipId: string;
    agentId: string;
    prompt: string;
    cronExpression: string;
    timezone: string;
    nextRunAt: string;
    isActive: boolean;
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
   * NOTE: MVP semantics are "one-shot": each schedule runs once and is deactivated.
   * Recurring behavior can be added later by computing a new nextRunAt instead
   * of deactivating the schedule.
   */
  async runDueSchedules(options?: {
    now?: Date;
    batchSize?: number;
    perStarshipLimit?: number;
  }): Promise<{ processed: number; skippedByLimit: number; errors: number }> {
    const now = options?.now ?? new Date();
    const batchSize = options?.batchSize ?? this.defaultBatchSize;
    const perStarshipLimit = options?.perStarshipLimit ?? this.defaultPerStarshipLimit;

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

        // Materialize as a new conversation + first message.
        const conversation = await this.conversationService.createConversation({
          title: `Scheduled – ${claimed.id}`,
          status: 'active',
          starshipId: claimed.starshipId,
          agentId: claimed.agentId,
        });

        // Use the same pipeline as user messages; no auth context for system-initiated runs.
        await this.conversationService.addConversationMessage(
          {
            conversationId: conversation.id,
            content: claimed.prompt,
            role: 'user',
            messageType: 'user_input',
            agentId: claimed.agentId,
          } as any,
          {}
        );

        // Best-effort linkage for idempotency/debugging.
        await this.repo.update(claimed.id, {
          lastRunConversationId: conversation.id,
        });

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


