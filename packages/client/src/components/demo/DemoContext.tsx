'use client'

/**
 * DemoContext — the single source of truth for the hero-video demo clock.
 *
 * The Mission Control demo used to own its own beat machine internally. But the
 * founder-video shoot needs the SAME beat to drive surfaces that live in
 * different parts of the tree:
 *   - the Mission Control page body (feed + tasks + approval rail)
 *   - the global navigation sidebar (room highlight + nested conversations)
 *   - the room-specific board dashboards (Support / Engineering / Growth)
 *
 * So the clock is lifted into a context mounted high in `client-layout` that
 * wraps both the sidebar and the page content. Everything reads `beat` from
 * here, so one timeline drives the whole shell in a single continuous take.
 *
 * Safety: the provider is INERT unless we're in development AND on a demo
 * surface (the /mission-control route, or any route with `?demo=1`). When
 * inactive it serves a frozen `beat: 0` value and attaches no timers or
 * keyboard listeners, so real users and every other route are untouched.
 *
 * Keyboard control (active only; any key pauses auto-play):
 *   Space / ArrowRight / Enter — advance one beat
 *   Backspace / ArrowLeft      — back one beat
 *   P                          — toggle auto-play
 *   R                          — restart from the top (re-enables auto-play)
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

export const DEMO_MAX_BEAT = 12
export const DEMO_STEP_MS = 3000
export const DEMO_HOLD_MS = 4500

export type DemoRoom = 'support' | 'engineering' | 'growth'

/** Which room the camera is "on" for a given beat, so the sidebar highlight can follow the VO. */
export type DemoSpotlight = {
  room: DemoRoom | null
  /** Seeded conversation id to highlight under the active room (wired in Phase 3). */
  conversationId: string | null
}

export type DemoState = {
  active: boolean
  beat: number
  maxBeat: number
  spotlight: DemoSpotlight
  advance: () => void
  rewind: () => void
  reset: () => void
}

// Maps a beat to the room the camera should be focused on. Mirrors the VO:
// Support spots the bug (1-3) → hands to Engineering, which fixes it (4-7) →
// "meanwhile, Growth" (8) → pivot/resolve happen back at the hub (9-12, no room).
export function spotlightForBeat(beat: number): DemoSpotlight {
  if (beat >= 1 && beat <= 3) return { room: 'support', conversationId: null }
  if (beat >= 4 && beat <= 7) return { room: 'engineering', conversationId: null }
  if (beat === 8) return { room: 'growth', conversationId: null }
  return { room: null, conversationId: null }
}

const INERT_SPOTLIGHT: DemoSpotlight = { room: null, conversationId: null }

const INERT: DemoState = {
  active: false,
  beat: 0,
  maxBeat: DEMO_MAX_BEAT,
  spotlight: INERT_SPOTLIGHT,
  advance: () => {},
  rewind: () => {},
  reset: () => {},
}

const DemoContext = createContext<DemoState>(INERT)

export function useDemo(): DemoState {
  return useContext(DemoContext)
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Read `?demo=1` from the URL without pulling in useSearchParams (which would
  // force a Suspense boundary). Re-checked on every navigation.
  const [searchDemo, setSearchDemo] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setSearchDemo(new URLSearchParams(window.location.search).get('demo') === '1')
    } catch {
      setSearchDemo(false)
    }
  }, [pathname])

  const isDev = process.env.NODE_ENV !== 'production'
  const onMissionControl = typeof pathname === 'string' && pathname.endsWith('/mission-control')
  const active = isDev && (onMissionControl || searchDemo)

  const [beat, setBeat] = useState(0)
  const [auto, setAuto] = useState(true)

  const advance = useCallback(() => setBeat((b) => (b < DEMO_MAX_BEAT ? b + 1 : b)), [])
  const rewind = useCallback(() => setBeat((b) => (b > 0 ? b - 1 : b)), [])
  const reset = useCallback(() => setBeat(0), [])

  // When the demo deactivates (navigated off a demo surface), rewind so a later
  // re-entry starts clean from beat 0 with auto-play on.
  useEffect(() => {
    if (!active) {
      setBeat(0)
      setAuto(true)
    }
  }, [active])

  // Manual keyboard control. Scrubbing pauses auto-play; R restarts it.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        setAuto(false)
        advance()
      } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setAuto(false)
        rewind()
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        setAuto((a) => !a)
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        reset()
        setAuto(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, advance, rewind, reset])

  // Auto-play: one step every STEP_MS, hold longer on the final beat, then loop.
  useEffect(() => {
    if (!active || !auto) return
    const atEnd = beat >= DEMO_MAX_BEAT
    const id = setTimeout(() => {
      setBeat((b) => (b >= DEMO_MAX_BEAT ? 0 : b + 1))
    }, atEnd ? DEMO_HOLD_MS : DEMO_STEP_MS)
    return () => clearTimeout(id)
  }, [active, auto, beat])

  const value = useMemo<DemoState>(
    () => ({
      active,
      beat: active ? beat : 0,
      maxBeat: DEMO_MAX_BEAT,
      spotlight: active ? spotlightForBeat(beat) : INERT_SPOTLIGHT,
      advance,
      rewind,
      reset,
    }),
    [active, beat, advance, rewind, reset]
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}
