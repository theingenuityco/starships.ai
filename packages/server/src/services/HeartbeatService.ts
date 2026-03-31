import { HeartbeatConfigRepository, HeartbeatRunRepository } from '@starships/models';
import type { HeartbeatConfigModel } from '@starships/protocol';
import { HEARTBEAT_OK_TOKEN } from '@starships/protocol';
import { getHeartbeatQueue, type HeartbeatJobData } from '@/queues/heartbeatQueue';

const ACTIVE_HOURS_TIME_PATTERN = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

/**
 * HeartbeatService
 *
 * Manages room-scoped heartbeat configurations and orchestrates the scheduler loop.
 */
export class HeartbeatService {
  private readonly configRepo: HeartbeatConfigRepository;
  private readonly runRepo: HeartbeatRunRepository;

  private readonly defaultBatchSize = 50;
  private readonly defaultPerStarshipLimit = 10;

  constructor() {
    this.configRepo = new HeartbeatConfigRepository();
    this.runRepo = new HeartbeatRunRepository();
  }

  // ---------------------------------------------------------------------------
  // Config CRUD
  // ---------------------------------------------------------------------------

  async createConfig(data: {
    agentId: string;
    roomConversationId: string;
    starshipId: string;
    ownerUserId: string;
    isEnabled?: boolean;
    intervalMinutes?: number;
    prompt?: string;
    ackMaxChars?: number;
    activeHoursStart?: string | null;
    activeHoursEnd?: string | null;
    activeHoursTimezone?: string | null;
  }): Promise<HeartbeatConfigModel> {
    return this.configRepo.create(data);
  }

  async getConfigByRoomAndAgent(roomConversationId: string, agentId: string): Promise<HeartbeatConfigModel | null> {
    return this.configRepo.findByRoomAndAgent(roomConversationId, agentId);
  }

  async listConfigsByRoom(roomConversationId: string): Promise<HeartbeatConfigModel[]> {
    return this.configRepo.findByRoom(roomConversationId);
  }

  async listConfigsByStarship(starshipId: string): Promise<HeartbeatConfigModel[]> {
    return this.configRepo.findByStarship(starshipId);
  }

  async updateConfig(id: string, updates: Partial<HeartbeatConfigModel>): Promise<HeartbeatConfigModel | null> {
    const merged: Partial<HeartbeatConfigModel> = { ...updates, updatedAt: new Date().toISOString() };

    if (merged.intervalMinutes != null || merged.isEnabled != null) {
      const existing = await this.configRepo.findById(id);
      if (existing) {
        const interval = merged.intervalMinutes ?? existing.intervalMinutes;
        merged.nextRunAt = new Date(Date.now() + interval * 60 * 1000).toISOString();
      }
    }

    return this.configRepo.update(id, merged);
  }

  async deleteConfig(id: string): Promise<boolean> {
    return this.configRepo.delete(id);
  }

  async getRunsByConfigId(configId: string, limit = 50) {
    return this.runRepo.findByConfigId(configId, limit);
  }

  // ---------------------------------------------------------------------------
  // Scheduler loop (called by heartbeatScheduler process)
  // ---------------------------------------------------------------------------

  async runDueHeartbeats(options?: {
    now?: Date;
    batchSize?: number;
    perStarshipLimit?: number;
  }): Promise<{ processed: number; skippedByLimit: number; errors: number }> {
    const now = options?.now ?? new Date();
    const batchSize = options?.batchSize ?? this.defaultBatchSize;
    const perStarshipLimit = options?.perStarshipLimit ?? this.defaultPerStarshipLimit;

    const queue = getHeartbeatQueue();

    const due = await this.configRepo.findDue(now, batchSize);
    if (!due.length) {
      return { processed: 0, skippedByLimit: 0, errors: 0 };
    }

    const perStarshipCounts = new Map<string, number>();
    let processed = 0;
    let skippedByLimit = 0;
    let errors = 0;

    for (const config of due) {
      const currentCount = perStarshipCounts.get(config.starshipId) ?? 0;
      if (currentCount >= perStarshipLimit) {
        skippedByLimit += 1;
        continue;
      }

      try {
        if (!HeartbeatService.isWithinActiveHours(config, now.getTime())) {
          await this.runRepo.create({
            heartbeatConfigId: config.id,
            agentId: config.agentId,
            starshipId: config.starshipId,
            status: 'skipped',
            result: 'quiet-hours',
            startedAt: now.toISOString(),
            completedAt: now.toISOString(),
          });

          await this.configRepo.claimDueHeartbeat(config.id, now, config.intervalMinutes);
          continue;
        }

        const claimed = await this.configRepo.claimDueHeartbeat(config.id, now, config.intervalMinutes);
        if (!claimed) {
          continue;
        }

        const jobData: HeartbeatJobData = {
          heartbeatConfigId: claimed.id,
          roomConversationId: claimed.roomConversationId,
          starshipId: claimed.starshipId,
          agentId: claimed.agentId,
          prompt: claimed.prompt,
          ackMaxChars: claimed.ackMaxChars,
          ownerUserId: claimed.ownerUserId,
          lastConversationId: claimed.lastConversationId,
          lastAlertText: claimed.lastAlertText,
          lastAlertAt: claimed.lastAlertAt,
        };

        await queue.add('heartbeat-run', jobData, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 30_000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        });

        perStarshipCounts.set(claimed.starshipId, currentCount + 1);
        processed += 1;
      } catch (err) {
        console.error('[HeartbeatService] Failed to process heartbeat config', {
          configId: config.id,
          error: err instanceof Error ? err.message : String(err),
        });
        errors += 1;
      }
    }

    return { processed, skippedByLimit, errors };
  }

  // ---------------------------------------------------------------------------
  // On-demand wake (enqueue immediately, bypassing next_run_at)
  // ---------------------------------------------------------------------------

  async wakeHeartbeat(configId: string): Promise<void> {
    const config = await this.configRepo.findById(configId);
    if (!config) {
      throw new Error('Heartbeat config not found');
    }

    const queue = getHeartbeatQueue();
    const jobData: HeartbeatJobData = {
      heartbeatConfigId: config.id,
      roomConversationId: config.roomConversationId,
      starshipId: config.starshipId,
      agentId: config.agentId,
      prompt: config.prompt,
      ackMaxChars: config.ackMaxChars,
      ownerUserId: config.ownerUserId,
      lastConversationId: config.lastConversationId,
      lastAlertText: config.lastAlertText,
      lastAlertAt: config.lastAlertAt,
    };

    await queue.add('heartbeat-run', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  // ---------------------------------------------------------------------------
  // HEARTBEAT_OK response parsing
  // ---------------------------------------------------------------------------

  static parseHeartbeatResponse(
    text: string,
    ackMaxChars: number,
  ): { shouldSuppress: boolean; strippedText: string } {
    const trimmed = text.trim();

    if (!trimmed) {
      return { shouldSuppress: true, strippedText: '' };
    }

    if (trimmed.startsWith(HEARTBEAT_OK_TOKEN)) {
      const remainder = trimmed.slice(HEARTBEAT_OK_TOKEN.length).trim();
      if (remainder.length <= ackMaxChars) {
        return { shouldSuppress: true, strippedText: remainder };
      }
      return { shouldSuppress: false, strippedText: remainder };
    }

    if (trimmed.endsWith(HEARTBEAT_OK_TOKEN)) {
      const remainder = trimmed.slice(0, trimmed.length - HEARTBEAT_OK_TOKEN.length).trim();
      if (remainder.length <= ackMaxChars) {
        return { shouldSuppress: true, strippedText: remainder };
      }
      return { shouldSuppress: false, strippedText: remainder };
    }

    return { shouldSuppress: false, strippedText: trimmed };
  }

  static isDuplicateAlert(
    text: string,
    lastAlertText: string | null | undefined,
    lastAlertAt: string | null | undefined,
    nowMs: number,
  ): boolean {
    if (!lastAlertText?.trim()) return false;
    if (text.trim() !== lastAlertText.trim()) return false;
    if (!lastAlertAt) return false;

    const lastMs = new Date(lastAlertAt).getTime();
    if (Number.isNaN(lastMs)) return false;

    return nowMs - lastMs < 24 * 60 * 60 * 1000;
  }

  // ---------------------------------------------------------------------------
  // Active hours
  // ---------------------------------------------------------------------------

  static isWithinActiveHours(
    config: HeartbeatConfigModel,
    nowMs?: number,
  ): boolean {
    const start = config.activeHoursStart;
    const end = config.activeHoursEnd;
    if (!start || !end) {
      return true;
    }

    const startMin = HeartbeatService.parseActiveHoursTime(start, false);
    const endMin = HeartbeatService.parseActiveHoursTime(end, true);
    if (startMin === null || endMin === null) {
      return true;
    }
    if (startMin === endMin) {
      return false;
    }

    const timeZone = HeartbeatService.resolveActiveHoursTimezone(config.activeHoursTimezone);
    const currentMin = HeartbeatService.resolveMinutesInTimeZone(nowMs ?? Date.now(), timeZone);
    if (currentMin === null) {
      return true;
    }

    if (endMin > startMin) {
      return currentMin >= startMin && currentMin < endMin;
    }
    return currentMin >= startMin || currentMin < endMin;
  }

  private static parseActiveHoursTime(raw: string, allow24: boolean): number | null {
    if (!ACTIVE_HOURS_TIME_PATTERN.test(raw)) {
      return null;
    }
    const [hourStr, minuteStr] = raw.split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }
    if (hour === 24) {
      if (!allow24 || minute !== 0) return null;
      return 24 * 60;
    }
    return hour * 60 + minute;
  }

  private static resolveActiveHoursTimezone(raw?: string | null): string {
    const trimmed = raw?.trim();
    if (!trimmed) return 'UTC';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
      return trimmed;
    } catch {
      return 'UTC';
    }
  }

  private static resolveMinutesInTimeZone(nowMs: number, timeZone: string): number | null {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(nowMs));
      const map: Record<string, string> = {};
      for (const part of parts) {
        if (part.type !== 'literal') {
          map[part.type] = part.value;
        }
      }
      const hour = Number(map.hour);
      const minute = Number(map.minute);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return null;
      }
      return hour * 60 + minute;
    } catch {
      return null;
    }
  }
}

export default HeartbeatService;
