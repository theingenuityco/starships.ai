import Redis, { type Redis as RedisClient } from 'ioredis';
import { getEnvConfig } from '@starships/env';
import type { ConversationStreamEvent } from '@starships/protocol';

type PublishResult = { streamId: string };

/**
 * Redis Streams–backed conversation event bus.
 *
 * Goals:
 * - cross-pod replay (ALB no-stickiness safe)
 * - ordered delivery via Redis stream IDs
 * - bounded retention via XTRIM MAXLEN (~)
 */
export class ConversationStreamBus {
  private static instance: ConversationStreamBus | null = null;
  private readonly redis: RedisClient;

  private constructor(redis: RedisClient) {
    this.redis = redis;
  }

  static getInstance(): ConversationStreamBus {
    if (ConversationStreamBus.instance) return ConversationStreamBus.instance;
    const env = getEnvConfig();
    if (!env.REDIS_HOST) {
      throw new Error('[ConversationStreamBus] REDIS_HOST is required for streaming.');
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
    ConversationStreamBus.instance = new ConversationStreamBus(redis);
    return ConversationStreamBus.instance;
  }

  streamKey(conversationId: string): string {
    return `starships:stream:conversation:${conversationId}`;
  }

  /**
   * Create a dedicated Redis connection for BLOCKing reads (XREAD BLOCK).
   *
   * IMPORTANT:
   * Never run blocking commands (e.g. XREAD BLOCK) on the same connection used
   * for publishing (XADD), or publishes can be stalled behind the block.
   */
  createReaderClient(): RedisClient {
    return this.redis.duplicate();
  }

  private static toStringSafe(v: unknown): string {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object') {
      // JSON-serialized Buffer shape: { type: 'Buffer', data: number[] }
      const rec = v as Record<string, unknown>;
      if (rec.type === 'Buffer' && Array.isArray(rec.data) && rec.data.every((n) => typeof n === 'number')) {
        try {
          return Buffer.from(rec.data as number[]).toString('utf8');
        } catch {
          return '';
        }
      }
    }
    try {
      // Node Buffer
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return v.toString('utf8');
    } catch {
      /* ignore */
    }
    return v == null ? '' : String(v);
  }

  private logWarn(message: string, meta?: Record<string, unknown>): void {
    try {
      console.warn(message, meta || {});
    } catch {
      /* ignore logging failures */
    }
  }

  async publish(conversationId: string, evt: ConversationStreamEvent, opts?: { maxLenApprox?: number }): Promise<PublishResult> {
    const key = this.streamKey(conversationId);
    const maxLen = typeof opts?.maxLenApprox === 'number' && opts.maxLenApprox > 0 ? Math.floor(opts.maxLenApprox) : 20_000;
    const payload = JSON.stringify(evt);
    const raw = await this.redis.call('XADD', key, 'MAXLEN', '~', String(maxLen), '*', 'evt', payload);
    const streamId = ConversationStreamBus.toStringSafe(raw);
    if (!streamId) throw new Error('[ConversationStreamBus] XADD returned empty stream id');
    return { streamId };
  }

  // Debug helpers (safe to call; used only when explicitly requested by the route)
  async getLastId(conversationId: string): Promise<string | null> {
    const key = this.streamKey(conversationId);
    try {
      const raw = await this.redis.call('XREVRANGE', key, '+', '-', 'COUNT', '1');
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const first = raw[0];
      if (!Array.isArray(first) || first.length < 1) return null;
      const id = ConversationStreamBus.toStringSafe(first[0]);
      return id || null;
    } catch (e) {
      this.logWarn('[ConversationStreamBus] getLastId failed', {
        conversationId,
        key,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  async getLen(conversationId: string): Promise<number> {
    const key = this.streamKey(conversationId);
    try {
      const n = await this.redis.call('XLEN', key);
      const num = typeof n === 'number' ? n : Number(ConversationStreamBus.toStringSafe(n));
      return Number.isFinite(num) ? num : 0;
    } catch (e) {
      this.logWarn('[ConversationStreamBus] getLen failed', {
        conversationId,
        key,
        error: e instanceof Error ? e.message : String(e),
      });
      return 0;
    }
  }

  /**
   * Read events after a cursor (exclusive).
   * If cursor is '$', blocks for new events only.
   */
  async read(
    conversationId: string,
    cursor: string,
    opts?: { blockMs?: number; count?: number },
    redisOverride?: RedisClient
  ): Promise<Array<{ id: string; evt: ConversationStreamEvent }>> {
    const key = this.streamKey(conversationId);
    const blockMs = typeof opts?.blockMs === 'number' && opts.blockMs >= 0 ? opts.blockMs : 25_000;
    const count = typeof opts?.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 200;

    let raw: unknown;
    try {
      const client = redisOverride ?? this.redis;
      raw = await client.call('XREAD', 'BLOCK', String(blockMs), 'COUNT', String(count), 'STREAMS', key, cursor);
    } catch (e) {
      // Expected during SSE disconnects: we deliberately close the dedicated reader connection
      // to break out of XREAD BLOCK. Avoid log spam for this benign shutdown path.
      if (redisOverride && e instanceof Error && /connection is closed/i.test(e.message)) {
        return [];
      }
      this.logWarn('[ConversationStreamBus] read failed', {
        conversationId,
        key,
        cursor,
        blockMs,
        count,
        override: !!redisOverride,
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
    if (!Array.isArray(raw) || raw.length === 0) return [];

    const out: Array<{ id: string; evt: ConversationStreamEvent }> = [];
    for (const streamItem of raw) {
      if (!Array.isArray(streamItem) || streamItem.length < 2) continue;
      const entries = streamItem[1];
      if (!Array.isArray(entries) || entries.length === 0) continue;

      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const id = ConversationStreamBus.toStringSafe(entry[0]);
        const kvAny = entry[1];
        if (!id || !Array.isArray(kvAny)) continue;

        const kv = kvAny.map((v: unknown) => ConversationStreamBus.toStringSafe(v));
        const idx = kv.findIndex((x) => x === 'evt');
        const payload = idx >= 0 ? kv[idx + 1] : '';
        if (!payload) continue;

        try {
          const evt = JSON.parse(payload) as ConversationStreamEvent;
          if (!evt || typeof (evt as { type?: unknown }).type !== 'string') continue;
          out.push({ id, evt });
        } catch (e) {
          // Avoid log spam in the hot path; this indicates a bad payload in the stream.
          // If you need to debug malformed events, temporarily add logging here.
          void e;
          continue;
        }
      }
    }

    return out;
  }

  /**
   * Read events in reverse chronological order (newest -> oldest) up to a start ID (inclusive).
   *
   * Useful for building a "best-effort" snapshot of in-progress streaming state without replaying
   * the entire stream.
   */
  async readReverse(
    conversationId: string,
    startId: string,
    opts?: { endId?: string; count?: number },
    redisOverride?: RedisClient
  ): Promise<Array<{ id: string; evt: ConversationStreamEvent }>> {
    const key = this.streamKey(conversationId);
    const endId = typeof opts?.endId === 'string' && opts.endId ? opts.endId : '-';
    const count = typeof opts?.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 2_000;

    let raw: unknown;
    try {
      const client = redisOverride ?? this.redis;
      raw = await client.call('XREVRANGE', key, startId, endId, 'COUNT', String(count));
    } catch (e) {
      if (redisOverride && e instanceof Error && /connection is closed/i.test(e.message)) {
        return [];
      }
      this.logWarn('[ConversationStreamBus] readReverse failed', {
        conversationId,
        key,
        startId,
        endId,
        count,
        override: !!redisOverride,
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }

    if (!Array.isArray(raw) || raw.length === 0) return [];

    const out: Array<{ id: string; evt: ConversationStreamEvent }> = [];
    for (const entry of raw) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const id = ConversationStreamBus.toStringSafe(entry[0]);
      const kvAny = entry[1];
      if (!id || !Array.isArray(kvAny)) continue;

      const kv = kvAny.map((v: unknown) => ConversationStreamBus.toStringSafe(v));
      const idx = kv.findIndex((x) => x === 'evt');
      const payload = idx >= 0 ? kv[idx + 1] : '';
      if (!payload) continue;

      try {
        const evt = JSON.parse(payload) as ConversationStreamEvent;
        if (!evt || typeof (evt as { type?: unknown }).type !== 'string') continue;
        out.push({ id, evt });
      } catch (e) {
        void e;
        continue;
      }
    }

    return out;
  }
}
