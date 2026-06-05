import { AgentDispatchRepository, AgentEventRepository, AgentHeartbeatRepository } from '@starships/models';

export type HeartbeatSchedulerConfig = {
  /** How often the scheduler scans for due heartbeats. */
  tickMs: number;
  /** Max heartbeats claimed per tick. */
  batchSize: number;
};

/**
 * In-process heartbeat scheduler.
 *
 * Every `tickMs` it claims the heartbeats that are due (atomically advancing
 * each one's next-fire time) and turns each into an `agent_dispatches` row the
 * agent picks up on its next `pull_commands`. Coalescing skips a beat while a
 * prior dispatch from the same heartbeat is still outstanding, so an offline
 * agent never accumulates a backlog.
 *
 * Single-process by design (matching PresenceService). The repository's
 * claim uses `FOR UPDATE SKIP LOCKED`, so it stays correct if the server is
 * ever scaled horizontally. It intentionally does not backfill missed beats
 * after downtime: the next fire is always one interval out from now.
 */
export class HeartbeatScheduler {
  private static instance: HeartbeatScheduler | null = null;
  private readonly cfg: HeartbeatSchedulerConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private constructor(cfg: HeartbeatSchedulerConfig) {
    this.cfg = cfg;
  }

  static getInstance(overrides?: Partial<HeartbeatSchedulerConfig>): HeartbeatScheduler {
    if (HeartbeatScheduler.instance) return HeartbeatScheduler.instance;
    const baseCfg: HeartbeatSchedulerConfig = { tickMs: 30_000, batchSize: 100 };
    HeartbeatScheduler.instance = new HeartbeatScheduler({ ...baseCfg, ...(overrides || {}) });
    return HeartbeatScheduler.instance;
  }

  start(): void {
    if (this.timer) return;
    // Fire-and-forget; tick() guards its own errors and overlap.
    this.timer = setInterval(() => void this.tick(), this.cfg.tickMs);
    // Don't keep the process alive solely for the scheduler.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One scan. Public for tests; never throws. */
  async tick(): Promise<void> {
    if (this.running) return; // skip if the previous tick is still in flight
    this.running = true;
    try {
      const heartbeats = new AgentHeartbeatRepository();
      const dispatches = new AgentDispatchRepository();
      const events = new AgentEventRepository();

      const due = await heartbeats.claimDue(this.cfg.batchSize);
      for (const hb of due) {
        try {
          // Coalesce: don't stack beats while the last one is still outstanding.
          if (await dispatches.hasOutstandingForHeartbeat(hb.id)) continue;

          const dispatch = await dispatches.create({
            starshipId: hb.starshipId,
            agentId: hb.agentId,
            commandType: hb.commandType,
            payload: hb.payload,
            heartbeatId: hb.id,
          });
          await events.append({
            starshipId: hb.starshipId,
            agentId: hb.agentId,
            dispatchId: dispatch.id,
            type: 'heartbeat_fired',
            payload: { heartbeatId: hb.id, commandType: hb.commandType },
          });
        } catch (err) {
          // One bad beat must not abort the rest of the batch.
          console.error(`[HEARTBEAT] failed to fire heartbeat ${hb.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[HEARTBEAT] tick failed:', err);
    } finally {
      this.running = false;
    }
  }
}
