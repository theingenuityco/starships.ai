let audioContext: AudioContext | null = null
let unlockListenersInstalled = false
let preferredFileSrc: string | null | undefined = undefined
let primedFileAudio = false
let fileAudioPool: HTMLAudioElement[] = []

// Avoid console spam for common autoplay-policy rejections.
const loggedPlayErrors = new Set<string>()
const MAX_LOGGED_PLAY_ERRORS = 20
function logPlayErrorOnce(kind: 'prime' | 'play', src: string | null, err: unknown) {
  try {
    const e = err as any
    const name = typeof e?.name === 'string' ? e.name : ''
    const message = typeof e?.message === 'string' ? e.message : String(err || '')
    const key = [kind, src || 'no-src', name || 'no-name', message || 'no-message'].join('|')
    if (loggedPlayErrors.has(key)) return
    loggedPlayErrors.add(key)
    if (loggedPlayErrors.size > MAX_LOGGED_PLAY_ERRORS) {
      // Best-effort cap: drop oldest-ish by recreating from the tail.
      const keep = Array.from(loggedPlayErrors).slice(-Math.floor(MAX_LOGGED_PLAY_ERRORS / 2))
      loggedPlayErrors.clear()
      keep.forEach(k => loggedPlayErrors.add(k))
    }

    const isAutoplayBlock = name === 'NotAllowedError' || /didn't interact|not allowed|gesture|autoplay/i.test(message || '')

    const payload = { kind, src, name: name || undefined, message: message || undefined }
    if (isAutoplayBlock) {
      // Normal browser behavior; keep it low-noise.
      console.debug('[notifications] sound blocked by autoplay policy (will work after user interaction)', payload)
    } else {
      console.warn('[notifications] failed to play notification sound', payload)
    }
  } catch {
    // Never let logging break the app.
  }
}

const NOTIFICATION_SOUND_CANDIDATES = [
  // Add your files here (served from `packages/client/public/` in Next.js)
  { src: '/sounds/notification.aac', mime: 'audio/aac' },
  { src: '/sounds/notification.wav', mime: 'audio/wav' },
] as const

function getPreferredNotificationFileSrc(): string | null {
  if (typeof window === 'undefined') return null
  if (preferredFileSrc !== undefined) return preferredFileSrc

  try {
    const probe = document.createElement('audio')
    for (const c of NOTIFICATION_SOUND_CANDIDATES) {
      const can = probe.canPlayType(c.mime)
      if (can === 'probably' || can === 'maybe') {
        preferredFileSrc = c.src
        return preferredFileSrc
      }
    }
  } catch {
    // ignore
  }

  preferredFileSrc = null
  return null
}

function getPooledAudio(src: string): HTMLAudioElement {
  // Reuse an idle element if possible.
  for (const a of fileAudioPool) {
    if (a.src.endsWith(src) && (a.paused || a.ended)) return a
  }
  // Keep a small pool to allow overlapping notifications.
  const a = new Audio(src)
  a.preload = 'auto'
  fileAudioPool.push(a)
  if (fileAudioPool.length > 4) {
    // Mutate in place to avoid stale references in long-running sessions.
    fileAudioPool.splice(0, fileAudioPool.length - 4)
  }
  return a
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctx) return null
  if (!audioContext) audioContext = new Ctx()
  return audioContext
}

async function tryUnlockAudioContext() {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    // Resume is required in many browsers before any audio can play.
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    // Best-effort; browsers may still block without a user gesture.
  }
}

async function tryPrimeNotificationFileAudio() {
  if (typeof window === 'undefined') return
  if (primedFileAudio) return
  primedFileAudio = true

  const src = getPreferredNotificationFileSrc()
  if (!src) return

  try {
    const a = getPooledAudio(src)
    // Attempt a quick play/pause during a user gesture to satisfy autoplay policies.
    a.volume = 0
    a.currentTime = 0
    await a.play()
    a.pause()
    a.currentTime = 0
  } catch (e) {
    // Best-effort; browsers may still block or the asset may not exist yet.
    logPlayErrorOnce('prime', src, e)
  }
}

/**
 * Installs one-time listeners that "unlock" WebAudio after the first user gesture.
 * Safe to call multiple times.
 */
export function setupNotificationAudioUnlock() {
  if (typeof window === 'undefined') return
  if (unlockListenersInstalled) return
  unlockListenersInstalled = true

  const handler = () => {
    void tryUnlockAudioContext()
    void tryPrimeNotificationFileAudio()
  }

  // Capture phase so we unlock before other handlers; once so it's cheap.
  window.addEventListener('pointerdown', handler, { capture: true, once: true })
  window.addEventListener('keydown', handler, { capture: true, once: true })
}

/**
 * Plays the notification sound.
 *
 * If you provide real sound files, put them here:
 * - `packages/client/public/sounds/notification.aac`
 * - `packages/client/public/sounds/notification.wav`
 *
 * We prefer the file sound (if playable), otherwise fall back to a synthesized chime (WebAudio).
 * This is best-effort: if the browser blocks autoplay, it fails silently.
 */
export function playNotificationChime(opts?: { volume?: number }) {
  if (typeof window === 'undefined') return
  setupNotificationAudioUnlock()

  const volume = Math.max(0, Math.min(1, Number(opts?.volume ?? 0.12) || 0.12))

  // Prefer a real audio file if present/playable.
  const fileSrc = getPreferredNotificationFileSrc()
  if (fileSrc) {
    try {
      const a = getPooledAudio(fileSrc)
      a.volume = volume
      a.currentTime = 0
      // IMPORTANT:
      // `HTMLAudioElement.play()` returns a Promise and will reject under autoplay policies
      // (e.g. "user didn't interact with the document first"). Catch to avoid noisy
      // unhandled promise rejections in the console.
      void a.play().catch(e => logPlayErrorOnce('play', fileSrc, e))
      return
    } catch {
      // fall through to WebAudio
    }
  }

  const ctx = getAudioContext()
  if (!ctx) return

  // Best-effort resume; if blocked, we just won't play.
  void tryUnlockAudioContext()

  try {
    const now = ctx.currentTime

    // Master gain (also provides a place to shape the overall envelope).
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.connect(ctx.destination)

    // Gentle overall envelope to avoid clicks.
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)

    const mkBeep = (start: number, freq: number, dur: number) => {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(1, start + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)

      osc.connect(gain)
      gain.connect(master)

      osc.start(start)
      osc.stop(start + dur + 0.02)
    }

    // Two short beeps with a tiny gap (Discord-ish).
    mkBeep(now + 0.0, 880, 0.075)
    mkBeep(now + 0.105, 660, 0.095)
  } catch {
    // Ignore (autoplay restrictions, device issues, etc.)
  }
}
