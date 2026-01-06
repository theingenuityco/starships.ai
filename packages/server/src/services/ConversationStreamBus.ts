import Redis from 'ioredis';
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
  private readonly redis: Redis;

  private constructor(redis: Redis) {
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

  async publish(conversationId: string, evt: ConversationStreamEvent, opts?: { maxLenApprox?: number }): Promise<PublishResult> {
    const key = this.streamKey(conversationId);
    const maxLen = typeof opts?.maxLenApprox === 'number' && opts.maxLenApprox > 0 ? Math.floor(opts.maxLenApprox) : 20_000;
    const payload = JSON.stringify(evt);
    const streamId = await (this.redis as any).xadd(key, 'MAXLEN', '~', String(maxLen), '*', 'evt', payload);
    return { streamId };
  }

  /**
   * Read events after a cursor (exclusive).
   * If cursor is '$', blocks for new events only.
   */
  async read(conversationId: string, cursor: string, opts?: { blockMs?: number; count?: number }): Promise<Array<{ id: string; evt: ConversationStreamEvent }>> {
    const key = this.streamKey(conversationId);
    const blockMs = typeof opts?.blockMs === 'number' && opts.blockMs >= 0 ? opts.blockMs : 25_000;
    const count = typeof opts?.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 200;

    const res = await (this.redis as any).xread('BLOCK', String(blockMs), 'COUNT', String(count), 'STREAMS', key, cursor);
    if (!res || res.length === 0) return [];
    const [, entries] = res[0] as any;
    if (!Array.isArray(entries) || entries.length === 0) return [];

    const out: Array<{ id: string; evt: ConversationStreamEvent }> = [];
    for (const entry of entries) {
      const id = String(entry?.[0] ?? '');
      const kv = entry?.[1];
      if (!id || !Array.isArray(kv)) continue;
      const idx = kv.findIndex((x: any) => String(x) === 'evt');
      const raw = idx >= 0 ? kv[idx + 1] : null;
      if (!raw) continue;
      try {
        const evt = JSON.parse(String(raw)) as ConversationStreamEvent;
        if (!evt || typeof (evt as any).type !== 'string') continue;
        out.push({ id, evt });
      } catch {
        continue;
      }
    }
    return out;
  }
}


