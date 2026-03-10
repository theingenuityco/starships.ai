import Redis, { type Redis as RedisClient } from 'ioredis';
import { getEnvConfig } from '@starships/env';

export type RoomGameActorState = {
  id: string;
  x: number;
  y: number;
  facing?: 'up' | 'down' | 'left' | 'right' | null;
  anim?: string | null;
  appearanceKey?: string | null;
  avatarAttachmentId?: string | null;
  label?: string | null;
  kind?: 'user' | 'agent';
  updatedAt?: string;
};

export class RoomGameStateService {
  private static instance: RoomGameStateService | null = null;
  private readonly redis: RedisClient;

  private constructor(redis: RedisClient) {
    this.redis = redis;
  }

  static getInstance(): RoomGameStateService {
    if (RoomGameStateService.instance) return RoomGameStateService.instance;
    const env = getEnvConfig();
    if (!env.REDIS_HOST) {
      throw new Error('[RoomGameStateService] REDIS_HOST is required for room game state.');
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
    RoomGameStateService.instance = new RoomGameStateService(redis);
    return RoomGameStateService.instance;
  }

  stateKey(roomConversationId: string): string {
    return `starships:room_game:state:${roomConversationId}`;
  }

  async getActor(roomConversationId: string, actorId: string): Promise<RoomGameActorState | null> {
    const key = this.stateKey(roomConversationId);
    const field = `actor:${actorId}`;
    try {
      const raw = await this.redis.hget(key, field);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RoomGameActorState;
      if (!parsed || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async setActor(roomConversationId: string, state: RoomGameActorState, opts?: { ttlSeconds?: number }): Promise<void> {
    const key = this.stateKey(roomConversationId);
    const field = `actor:${state.id}`;
    const ttlSeconds = typeof opts?.ttlSeconds === 'number' && opts.ttlSeconds > 0 ? Math.floor(opts.ttlSeconds) : 2 * 60 * 60;
    const payload = JSON.stringify({ ...state, updatedAt: new Date().toISOString() });
    try {
      await this.redis.multi().hset(key, field, payload).expire(key, ttlSeconds).exec();
    } catch {
      // best-effort
    }
  }
}

