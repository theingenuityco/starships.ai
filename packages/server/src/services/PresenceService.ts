import Redis, { type Redis as RedisClient } from 'ioredis';
import { getEnvConfig } from '@starships/env';
import { logger } from '@/utils/logger';

export type PresenceConfig = {
  /**
   * A user is considered online if their last heartbeat is within this window.
   */
  onlineWindowMs: number;
  /**
   * Prune entries older than this window to keep keys bounded.
   */
  pruneWindowMs: number;
  /**
   * Redis key TTL for presence ZSETs. This prevents abandoned keys from lingering forever.
   */
  keyTtlMs: number;
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

  private logRedisError(operation: string, error: unknown, context?: Record<string, unknown>) {
    logger.warn(
      '[PresenceService] Redis operation failed',
      {
        operation,
        ...(context || {}),
        error: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error : undefined
    );
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

    // Surface connection issues instead of failing silently.
    redis.on('error', (err) => {
      logger.warn('[PresenceService] Redis client error', { error: err?.message || String(err) }, err);
    });

    const baseCfg: PresenceConfig = {
      onlineWindowMs: 45_000,
      // Presence is an ephemeral UX feature; keep the ZSET bounded to a reasonable window.
      pruneWindowMs: 60 * 60 * 1000, // 1 hour
      // Ensure keys expire when inactive; keep TTL >= pruneWindow so pruning semantics remain valid.
      keyTtlMs: 2 * 60 * 60 * 1000, // 2 hours
    };

    const merged = { ...baseCfg, ...(overrides || {}) };
    // Safety: ensure TTL is always at least pruneWindowMs (plus a small buffer).
    const cfg: PresenceConfig = {
      ...merged,
      keyTtlMs: Math.max(merged.keyTtlMs, merged.pruneWindowMs + 5 * 60 * 1000),
    };

    PresenceService.instance = new PresenceService(redis, cfg);
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
    const cutoff = nowMs - this.cfg.pruneWindowMs;
    const ttlSeconds = Math.max(1, Math.ceil(this.cfg.keyTtlMs / 1000));

    // Best-effort: do not hard-fail requests on Redis issues (presence is non-critical UX).
    try {
      // Keep the ZSET bounded and ensure the key expires if inactive.
      await this.redis
        .multi()
        // ZADD key score member
        .zadd(key, String(nowMs), userId)
        // EXPIRE key ttlSeconds
        .expire(key, ttlSeconds)
        // ZREMRANGEBYSCORE key -inf cutoff
        .zremrangebyscore(key, '-inf', String(cutoff))
        .exec();
    } catch (error) {
      this.logRedisError('touch', error, { starshipId, userId });
    }
  }

  async pruneOld(starshipId: string, nowMs: number = Date.now()): Promise<void> {
    const key = this.presenceKey(starshipId);
    const cutoff = nowMs - this.cfg.pruneWindowMs;
    const ttlSeconds = Math.max(1, Math.ceil(this.cfg.keyTtlMs / 1000));
    try {
      // ZREMRANGEBYSCORE key -inf cutoff
      await this.redis.zremrangebyscore(key, '-inf', String(cutoff));
      // Keep key TTL fresh if it's still being accessed.
      await this.redis.expire(key, ttlSeconds);
    } catch (error) {
      this.logRedisError('pruneOld', error, { starshipId });
    }
  }

  async listOnlineUserIds(starshipId: string, nowMs: number = Date.now()): Promise<string[]> {
    const key = this.presenceKey(starshipId);
    const cutoff = nowMs - this.cfg.onlineWindowMs;
    try {
      // Keep the set bounded on reads as well (covers cases where pruning wasn't invoked on touch).
      await this.pruneOld(starshipId, nowMs);

      // ZRANGEBYSCORE key cutoff +inf
      const ids = await this.redis.zrangebyscore(key, String(cutoff), '+inf');
      return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string' && x.length > 0) : [];
    } catch (error) {
      this.logRedisError('listOnlineUserIds', error, { starshipId });
      return [];
    }
  }
}

