import Redis, { type Redis as RedisClient } from 'ioredis';
import { getEnvConfig } from '@starships/env';

export type RoomGameMapRef =
  | { kind: 'none' }
  | { kind: 'procedural'; seed: string; generatorVersion: string }
  | { kind: 'ldtk_attachment'; attachmentId: string }
  | { kind: 'ldtk_url'; url: string }
  | { kind: 'tiled_attachment'; attachmentId: string };

export type RoomGameConfig = {
  mapRef?: RoomGameMapRef;
  updatedAt?: string;
};

export class RoomGameConfigService {
  private static instance: RoomGameConfigService | null = null;
  private readonly redis: RedisClient;

  private constructor(redis: RedisClient) {
    this.redis = redis;
  }

  static getInstance(): RoomGameConfigService {
    if (RoomGameConfigService.instance) return RoomGameConfigService.instance;
    const env = getEnvConfig();
    if (!env.REDIS_HOST) {
      throw new Error('[RoomGameConfigService] REDIS_HOST is required for room game config.');
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
    RoomGameConfigService.instance = new RoomGameConfigService(redis);
    return RoomGameConfigService.instance;
  }

  configKey(roomConversationId: string): string {
    return `starships:room_game:config:${roomConversationId}`;
  }

  async get(roomConversationId: string): Promise<RoomGameConfig | null> {
    const key = this.configKey(roomConversationId);
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RoomGameConfig;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  async set(roomConversationId: string, cfg: RoomGameConfig, opts?: { ttlSeconds?: number }): Promise<void> {
    const key = this.configKey(roomConversationId);
    const ttlSeconds = typeof opts?.ttlSeconds === 'number' && opts.ttlSeconds > 0 ? Math.floor(opts.ttlSeconds) : 24 * 60 * 60;
    const payload = JSON.stringify({ ...cfg, updatedAt: new Date().toISOString() });
    try {
      await this.redis.set(key, payload, 'EX', ttlSeconds);
    } catch {
      // best-effort
    }
  }
}

