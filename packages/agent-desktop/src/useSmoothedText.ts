import { useEffect, useRef, useState } from 'react';

// Steady reveal rate (chars/sec) during normal flow — the floor that keeps text
// moving continuously between bursts so it never flushes-then-stalls. When the
// backlog grows (model out-streaming us) we speed up proportionally, capped, so
// latency stays bounded instead of falling seconds behind. All tunable.
const BASE_CPS = 120;
const MAX_CPS = 600;
const CATCHUP = 4; // backlog chars × this = target cps when behind

/**
 * Decouples "text received" from "text displayed". Token deltas arrive in bursts
 * (process/pipe buffering lumps several together, then a pause), so rendering the
 * raw buffer makes text jump in chunks. This drains `target` into the display at a
 * steady, time-based cadence so bursty input renders as a continuous type-out.
 *
 * Key property: the drain rate is a *constant characters-per-second*, not a fixed
 * fraction-per-frame. A fraction-per-frame rate empties any burst in a few frames
 * and then idles until the next one — which just reproduces the burstiness. Pacing
 * by wall-clock time (via the rAF timestamp) keeps the pipe full between bursts.
 *
 * On reset or a shorter target (a finished turn superseding the in-flight buffer)
 * the display snaps to it so no stale tail lingers.
 */
export function useSmoothedText(target: string): string {
  // Revealed length, kept in a ref so the rAF loop can advance it without
  // re-subscribing; `force` triggers the actual React render.
  const shownLenRef = useRef(target.length);
  const targetRef = useRef(target);
  targetRef.current = target;
  const [, force] = useState(0);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    let lastTs: number | null = null; // timestamp of previous frame (rAF clock)

    const tick = (ts: number) => {
      if (cancelled) return;
      const want = targetRef.current.length;

      // Reset / shorter target: snap back instantly rather than "deleting" chars.
      if (shownLenRef.current > want) {
        shownLenRef.current = want;
        force((n) => (n + 1) % 1_000_000);
      }

      if (shownLenRef.current < want) {
        // Seconds since the last frame, clamped so a long gap (tab backgrounded,
        // a delta after a pause) doesn't dump a huge jump in one frame.
        const dt = lastTs == null ? 0 : Math.min(0.05, (ts - lastTs) / 1000);
        const behind = want - shownLenRef.current;
        const cps = Math.min(MAX_CPS, Math.max(BASE_CPS, behind * CATCHUP));
        const advance = Math.max(1, Math.round(cps * dt));
        shownLenRef.current = Math.min(want, shownLenRef.current + advance);
        force((n) => (n + 1) % 1_000_000);
      }

      lastTs = ts;
      raf = requestAnimationFrame(tick); // persistent loop; no-ops cheaply when caught up
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []); // one loop for the component's lifetime; reads target via ref

  return targetRef.current.slice(0, shownLenRef.current);
}
