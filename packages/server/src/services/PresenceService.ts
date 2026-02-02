import Redis, { type Redis as RedisClient } from 'ioredis';
import { getEnvConfig } from '@starships/env';

export type PresenceConfig = {
  /**
   * A user is considered online if their last heartbeat is within this window.
   */
  onlineWindowMs: number;
  /**
   * Prune entries older than this window to keep keys bounded.
   */
  pruneWindowMs: number;
};

/**
 * Redis-backed presence tracking (activity-based).
 *
 * We track last-seen timestamps per user per starship in a ZSET:
 * - key: starships:presence:last_seen:${starshipId}
 * - member: userId
 * - score: lastSeenMs (epoch ms)
 */
export class PresenceService {
  private static instance: PresenceService | null = null;
  private readonly redis: RedisClient;
  private readonly cfg: PresenceConfig;

  private constructor(redis: RedisClient, cfg: PresenceConfig) {
    this.redis = redis;
    this.cfg = cfg;
  }

  static getInstance(overrides?: Partial<PresenceConfig>): PresenceService {
    if (PresenceService.instance) return PresenceService.instance;
    const env = getEnvConfig();
    if (!env.REDIS_HOST) {
      throw new Error('[PresenceService] REDIS_HOST is required for presence tracking.');
    }
    const redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT ?? 6379,
      password: typeof env.REDIS_PASSWORD === 'string' ? env.REDIS_PASSWORD : undefined,
      db: typeof env.REDIS_DB === 'number' ? env.REDIS_DB : 0,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    PresenceService.instance = new PresenceService(redis, {
      onlineWindowMs: 45_000,
      pruneWindowMs: 24 * 60 * 60 * 1000,
      ...(overrides || {}),
    });
    return PresenceService.instance;
  }

  presenceKey(starshipId: string): string {
    return `starships:presence:last_seen:${starshipId}`;
  }

  getConfig(): PresenceConfig {
    return this.cfg;
  }

  async touch(starshipId: string, userId: string, nowMs: number = Date.now()): Promise<void> {
    const key = this.presenceKey(starshipId);
    // ZADD key score member
    await this.redis.zadd(key, String(nowMs), userId);
  }

  async pruneOld(starshipId: string, nowMs: number = Date.now()): Promise<void> {
    const key = this.presenceKey(starshipId);
    const cutoff = nowMs - this.cfg.pruneWindowMs;
    // ZREMRANGEBYSCORE key -inf cutoff
    await this.redis.zremrangebyscore(key, '-inf', String(cutoff));
  }

  async listOnlineUserIds(starshipId: string, nowMs: number = Date.now()): Promise<string[]> {
    const key = this.presenceKey(starshipId);
    const cutoff = nowMs - this.cfg.onlineWindowMs;
    // ZRANGEBYSCORE key cutoff +inf
    const ids = await this.redis.zrangebyscore(key, String(cutoff), '+inf');
    return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string' && x.length > 0) : [];
  }
}

