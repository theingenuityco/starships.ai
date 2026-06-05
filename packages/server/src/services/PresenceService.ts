export type PresenceConfig = {
  /**
   * A user is considered online if their last heartbeat is within this window.
   */
  onlineWindowMs: number;
  /**
   * Prune entries older than this window to keep the map bounded.
   */
  pruneWindowMs: number;
};

/**
 * In-memory presence tracking (activity-based).
 *
 * Single-process: presence lives in a Map per starship of userId -> lastSeenMs.
 * Presence is ephemeral UX state; it intentionally does not survive a restart and
 * does not coordinate across instances. (A broker can be reintroduced only if the
 * app is ever scaled horizontally.)
 */
export class PresenceService {
  private static instance: PresenceService | null = null;
  private readonly cfg: PresenceConfig;
  private readonly lastSeen = new Map<string, Map<string, number>>();

  private constructor(cfg: PresenceConfig) {
    this.cfg = cfg;
  }

  static getInstance(overrides?: Partial<PresenceConfig>): PresenceService {
    if (PresenceService.instance) return PresenceService.instance;
    const baseCfg: PresenceConfig = {
      onlineWindowMs: 45_000,
      pruneWindowMs: 60 * 60 * 1000, // 1 hour
    };
    PresenceService.instance = new PresenceService({ ...baseCfg, ...(overrides || {}) });
    return PresenceService.instance;
  }

  presenceKey(starshipId: string): string {
    return `presence:${starshipId}`;
  }

  getConfig(): PresenceConfig {
    return this.cfg;
  }

  private starshipMap(starshipId: string): Map<string, number> {
    let m = this.lastSeen.get(starshipId);
    if (!m) {
      m = new Map<string, number>();
      this.lastSeen.set(starshipId, m);
    }
    return m;
  }

  async touch(starshipId: string, userId: string, nowMs: number = Date.now()): Promise<void> {
    const m = this.starshipMap(starshipId);
    m.set(userId, nowMs);
    this.prune(m, nowMs);
  }

  private prune(m: Map<string, number>, nowMs: number): void {
    const cutoff = nowMs - this.cfg.pruneWindowMs;
    for (const [userId, ts] of m) {
      if (ts < cutoff) m.delete(userId);
    }
  }

  async pruneOld(starshipId: string, nowMs: number = Date.now()): Promise<void> {
    const m = this.lastSeen.get(starshipId);
    if (m) this.prune(m, nowMs);
  }

  async listOnlineUserIds(starshipId: string, nowMs: number = Date.now()): Promise<string[]> {
    const m = this.lastSeen.get(starshipId);
    if (!m) return [];
    this.prune(m, nowMs);
    const cutoff = nowMs - this.cfg.onlineWindowMs;
    const ids: string[] = [];
    for (const [userId, ts] of m) {
      if (ts >= cutoff) ids.push(userId);
    }
    return ids;
  }
}
