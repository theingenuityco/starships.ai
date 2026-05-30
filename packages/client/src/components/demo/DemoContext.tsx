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
 * Playback: auto-play is ON by default and ticks through the timeline, but
 * hard-pauses on each beat in `MILESTONE_BEATS`. A keypress (Space / →) at a
 * milestone advances one beat and auto-play resumes until the next milestone.
 * This gives the presenter natural beats to talk over without micro-driving
 * every step. `P` overrides (toggles auto-play); rewinding (←) pauses.
 *
 * Keyboard control (active only):
 *   Space / ArrowRight / Enter — advance one beat (auto-play stays on)
 *   Backspace / ArrowLeft      — back one beat (pauses auto-play)
 *   P                          — toggle auto-play
 *   R                          — restart from the top (auto-play resumes)
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

// One animation per beat, with one deliberate bundling: a card status/assignee
// change shares its beat with its matching task-board log line (e.g. the
// Support card flipping to TRIAGED and the "Sara moved #1042 to Triaged" log
// entry land together, since they're the same logical action). Everything else
// — conversation rows, gate transitions, indicator-only card updates — stays
// on its own beat. See `taskBoardActivity` for the full ordering.
export const DEMO_MAX_BEAT = 39
// The demo opens on beat 1, not 0: beat 0 is a blank state (every activity
// builder starts at `beat >= 1`), and we never want the demo to start empty.
export const DEMO_MIN_BEAT = 1
export const DEMO_STEP_MS = 1500
export const DEMO_HOLD_MS = 3000

/**
 * Beats where auto-play hard-pauses for the presenter to talk over the moment
 * before continuing on keypress. Picked to land on narrative inflection points
 * (per the timeline in `demoActivity.ts`):
 *   1   opening — Nisha appears in the activity log (demo opens here, paused)
 *   3   "Checking for new support tickets" lands in the activity log
 *   6   ticket #1042 card appears on the Support Tickets board
 *  12   fix/mobile-signin card appears on the Engineering Pipeline
 *  16   "Implementing fix for mobile sign-in" lands in the activity log
 *  19   "Running final QA on the contact list" lands in the activity log
 *  31   both approval gates are active in Needs your attention
 *  39   end state — everything resolved, demo holds until R resets
 */
export const MILESTONE_BEATS: ReadonlySet<number> = new Set([1, 3, 6, 12, 16, 19, 31, 39])

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
// Growth opens with Nisha (1-2), Support gets the ticket and triages it (3-11),
// Engineering scopes the bug and Mason starts building (12-15), Growth runs
// verification and hands off the QA'd list (16-24), then everything converges
// at the hub for the review handoff, pivot, and resolve (25+, no room).
export function spotlightForBeat(beat: number): DemoSpotlight {
  if (beat >= 1 && beat <= 2) return { room: 'growth', conversationId: null }
  if (beat >= 3 && beat <= 11) return { room: 'support', conversationId: null }
  if (beat >= 12 && beat <= 15) return { room: 'engineering', conversationId: null }
  if (beat >= 16 && beat <= 24) return { room: 'growth', conversationId: null }
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

  const [beat, setBeat] = useState(DEMO_MIN_BEAT)
  // Auto-play is ON by default and self-pauses at each milestone beat. The
  // presenter resumes by pressing Space / →. `P` overrides for full manual.
  const [auto, setAuto] = useState(true)

  const advance = useCallback(() => setBeat((b) => (b < DEMO_MAX_BEAT ? b + 1 : b)), [])
  const rewind = useCallback(() => setBeat((b) => (b > DEMO_MIN_BEAT ? b - 1 : b)), [])
  const reset = useCallback(() => setBeat(DEMO_MIN_BEAT), [])

  // When the demo activates, restart from the opening beat with auto-play on
  // so each entry plays cleanly from the top. When it deactivates, freeze.
  useEffect(() => {
    setBeat(DEMO_MIN_BEAT)
    setAuto(active)
  }, [active])

  // Keyboard control. Advancing (Space / → / Enter) keeps auto-play on so it
  // resumes past the milestone. Rewinding (← / Backspace) pauses, since the
  // presenter is likely scrubbing back to re-emphasize something.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
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

  // Auto-play: one step every STEP_MS, hold longer on the final beat, then
  // loop. Hard-pauses at each MILESTONE_BEATS entry — no timer is scheduled
  // while on a milestone, so the demo sits there until the presenter advances.
  useEffect(() => {
    if (!active || !auto) return
    if (MILESTONE_BEATS.has(beat)) return
    const atEnd = beat >= DEMO_MAX_BEAT
    const id = setTimeout(() => {
      setBeat((b) => (b >= DEMO_MAX_BEAT ? DEMO_MIN_BEAT : b + 1))
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
