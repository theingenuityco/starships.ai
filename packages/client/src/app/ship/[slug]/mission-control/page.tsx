'use client'

/**
 * Mission-control composite page — staged single-frame demo surface used for the
 * hero-video shoot. Mock-fed and gated off in production. Keyboard control:
 *   Space / ArrowRight  — advance to the next beat
 *   Backspace / ArrowLeft — go back one beat
 *   R                   — reset to beat 0
 *
 * The frame matches the script: three lanes (Support / Engineering / Ship) on the
 * left, a YOUR REVIEW rail on the right showing the real ToolApprovalCallout (which
 * renders Approve / Request changes for PR-class tools).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { notFound } from 'next/navigation'
import { cn } from '@/lib/utils'
import { avatarColour } from '@/components/dashboard/utils'
import Icon from '@/components/primitives/Icon'
import { ToolApprovalCallout } from '@/components/conversation/ToolApprovalCallout'

// ─── Beats ───────────────────────────────────────────────────────────────────
// Aligned with the locked VO script. Advance with Space; rewind with Backspace.

type Beat = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

const BEAT_LABELS: Record<Beat, string> = {
  0: 'Idle',
  1: 'Customer hits a bug',
  2: 'Support hands to engineering',
  3: 'Engineering builds the fix',
  4: 'Waiting on you',
  5: 'You say go',
  6: 'It ships',
  7: 'Life goes on',
}

const MAX_BEAT: Beat = 7

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold text-white shrink-0', avatarColour(name), className)}>
      {getInitials(name)}
    </div>
  )
}

// ─── Lane ────────────────────────────────────────────────────────────────────

function LaneHeader({ name, hint }: { name: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between px-1 pb-3">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">{name}</p>
        {hint ? <p className="text-[10px] text-muted-foreground/40 mt-0.5">{hint}</p> : null}
      </div>
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-pulse" />
    </div>
  )
}

// ─── Cards ───────────────────────────────────────────────────────────────────

function TicketCard({
  id,
  customer,
  subject,
  message,
  status,
  tags = [],
  primary = false,
}: {
  id: number | string
  customer: string
  subject: string
  message: string
  status: 'NEW' | 'TRIAGED' | 'RESOLVED'
  tags?: string[]
  primary?: boolean
}) {
  const statusCls =
    status === 'NEW'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
      : status === 'TRIAGED'
        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
  return (
    <div className={cn('rounded-lg border bg-card/95 p-3 shadow-sm transition-all duration-500', primary ? 'border-primary/40 ring-1 ring-primary/30' : 'border-border/60', !primary && 'opacity-70')}>
      <div className="flex items-start gap-2.5">
        <Avatar name={customer} className="h-7 w-7 text-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground/60">#{id}</span>
            <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', statusCls)}>
              {status}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium leading-snug truncate">{subject}</p>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{message}</p>
          {tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function EngineeringCard({
  id,
  title,
  stage,
  substates = [],
  primary = false,
}: {
  id: number | string
  title: string
  stage: 'Scoped' | 'Building' | 'In Review' | 'Merged'
  substates?: string[]
  primary?: boolean
}) {
  const stageCls =
    stage === 'Merged'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      : stage === 'In Review'
        ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30'
        : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
  return (
    <div className={cn('rounded-lg border bg-card/95 p-3 shadow-sm transition-all duration-500', primary ? 'border-primary/40 ring-1 ring-primary/30' : 'border-border/60', !primary && 'opacity-70')}>
      <div className="flex items-center gap-2">
        <Icon name="git-branch" className="h-3.5 w-3.5 text-muted-foreground/70" />
        <span className="font-mono text-[10px] text-muted-foreground/60">{id}</span>
        <span className={cn('ml-auto inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', stageCls)}>
          {stage}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug">{title}</p>
      {substates.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {substates.map((s) => (
            <li key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
              <Icon name="check" className="h-3 w-3 text-emerald-500" />
              {s}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ShipCard({
  id,
  title,
  state,
  primary = false,
}: {
  id: number | string
  title: string
  state: 'Merged' | 'Deployed'
  primary?: boolean
}) {
  return (
    <div className={cn('rounded-lg border bg-card/95 p-3 shadow-sm transition-all duration-500', primary ? 'border-emerald-500/40 ring-1 ring-emerald-500/30' : 'border-border/60', !primary && 'opacity-70')}>
      <div className="flex items-center gap-2">
        <Icon name={state === 'Deployed' ? 'arrow-right' : 'git-branch'} className="h-3.5 w-3.5 text-emerald-500" />
        <span className="font-mono text-[10px] text-muted-foreground/60">{id}</span>
        <span className="ml-auto inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          {state}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug">{title}</p>
    </div>
  )
}

function ReplyCard({ customer, message }: { customer: string; message: string }) {
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center gap-2">
        <Icon name="mail" className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Reply sent</span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">to {customer}</span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{message}</p>
    </div>
  )
}

// ─── Demo state machine ──────────────────────────────────────────────────────

const PRIYA_MESSAGE = "Can't log in on mobile — Sign in button does nothing."
const REPLY_MESSAGE = "Hi Priya — this is fixed and live now. Thanks for flagging it."

function useBeatMachine() {
  const [beat, setBeat] = useState<Beat>(0)
  const advance = useCallback(() => {
    setBeat((b) => (b < MAX_BEAT ? ((b + 1) as Beat) : b))
  }, [])
  const rewind = useCallback(() => {
    setBeat((b) => (b > 0 ? ((b - 1) as Beat) : b))
  }, [])
  const reset = useCallback(() => setBeat(0), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        advance()
      } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
        e.preventDefault()
        rewind()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        reset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, rewind, reset])

  return { beat, setBeat, advance, rewind, reset }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MissionControlPage(): React.JSX.Element {
  if (process.env.NODE_ENV === 'production') notFound()

  const { beat, advance, rewind, reset } = useBeatMachine()

  // ── Derived lane state ─────────────────────────────────────────────────────

  // Support: the principal ticket #1042 appears at b=1, flips TRIAGED at b=2, RESOLVED at b=6.
  const ticketStatus: 'NEW' | 'TRIAGED' | 'RESOLVED' = beat >= 6 ? 'RESOLVED' : beat >= 2 ? 'TRIAGED' : 'NEW'
  const showTicket = beat >= 1
  const showReply = beat >= 6
  const triageTags = beat >= 2 ? ['bug', 'mobile', 'auth'] : []

  // Engineering: principal card appears at b=2 (Scoped), Building at b=3, In Review at b=4, Merged at b=6.
  const engineeringStage: 'Scoped' | 'Building' | 'In Review' | 'Merged' = beat >= 6 ? 'Merged' : beat >= 4 ? 'In Review' : beat >= 3 ? 'Building' : 'Scoped'
  const showEngineering = beat >= 2
  const engineeringSubstates = useMemo(() => {
    const out: string[] = []
    if (beat >= 3) out.push('Reproduced — iOS Safari, button unresponsive after resize')
    if (beat >= 3) out.push('Fix applied')
    if (beat >= 4) out.push('PR #432 — 12 checks passed')
    return out
  }, [beat])

  // Ship: card moves into Ship lane as Merged at b=6, flips Deployed slightly after.
  const showMerged = beat >= 6
  const showDeployed = beat >= 6

  // YOUR REVIEW: PR approval appears at b=4, disappears once user "clicks approve" at b=5.
  const showApproval = beat >= 4 && beat < 5

  // ── Reset state when user goes back ────────────────────────────────────────
  // (state derives from beat, no extra resets needed.)

  return (
    <div className="relative h-full w-full bg-[#07080b] text-foreground">
      {/* Wallpaper tint */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(at 20% 10%, rgba(99,102,241,0.10), transparent 50%), radial-gradient(at 80% 0%, rgba(16,185,129,0.10), transparent 50%), radial-gradient(at 50% 100%, rgba(168,85,247,0.08), transparent 60%)',
        }}
      />

      <div className="relative h-full flex flex-col">
        {/* Title bar */}
        <div className="flex-none flex items-center gap-3 border-b border-border/30 px-5 py-2.5">
          <span className="font-brand text-sm font-semibold tracking-tight">Starships</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-xs font-mono text-muted-foreground/70">mission control</span>
          <span className="ml-auto flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
            <span>Space ▸ next</span>
            <span>Backspace ◂ back</span>
            <span>R ↺ reset</span>
            <span className="rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-muted-foreground">
              Beat {beat} · {BEAT_LABELS[beat]}
            </span>
          </span>
        </div>

        {/* Main grid: 3 lanes + YOUR REVIEW rail */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_360px] gap-4 p-5 overflow-hidden">
          {/* SUPPORT lane */}
          <section className="min-w-0 flex flex-col rounded-xl border border-border/40 bg-card/30 p-3 backdrop-blur">
            <LaneHeader name="Support" hint="Tickets in flight" />
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
              {showTicket ? (
                <TicketCard
                  primary
                  id={1042}
                  customer="Priya R."
                  subject={PRIYA_MESSAGE}
                  message="Tried Safari + Chrome on iPhone, no luck."
                  status={ticketStatus}
                  tags={triageTags}
                />
              ) : null}
              {showReply ? <ReplyCard customer="Priya R." message={REPLY_MESSAGE} /> : null}
              {/* Ambient — quiet life happening */}
              <TicketCard id={1041} customer="Marco V." subject="CSV export missing column 'plan'" message="Showed up yesterday after the update." status="TRIAGED" />
              <TicketCard id={1040} customer="Sam K."   subject="Billing receipt PDF won't open"      message="Both Chrome and Firefox, downloads but blank." status="RESOLVED" />
              <TicketCard id={1039} customer="Lila G."  subject="2FA email arrives 5 minutes late"     message="Happens on enterprise tenants only." status="NEW" />
            </div>
          </section>

          {/* ENGINEERING lane */}
          <section className="min-w-0 flex flex-col rounded-xl border border-border/40 bg-card/30 p-3 backdrop-blur">
            <LaneHeader name="Engineering" hint="Backlog execution" />
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
              {showEngineering ? (
                <EngineeringCard
                  primary
                  id="fix/mobile-signin"
                  title="Fix mobile sign-in button"
                  stage={engineeringStage}
                  substates={engineeringSubstates}
                />
              ) : null}
              {/* Ambient */}
              <EngineeringCard id="fix/billing-null"      title="Null deref in billing"   stage="In Review" substates={['Tests passed (142)']} />
              <EngineeringCard id="chore/dep-zod"         title="Bump zod"                stage="Scoped" />
              <EngineeringCard id="feat/refund-edges"     title="Refund edge cases"       stage="Building" substates={['Reproduced']} />
            </div>
          </section>

          {/* SHIP lane */}
          <section className="min-w-0 flex flex-col rounded-xl border border-border/40 bg-card/30 p-3 backdrop-blur">
            <LaneHeader name="Ship" hint="Merged & deployed" />
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
              {showMerged ? (
                <ShipCard primary id="PR #432" title="Fix mobile sign-in button" state="Merged" />
              ) : null}
              {showDeployed ? (
                <ShipCard primary id="PR #432" title="Deployed to production" state="Deployed" />
              ) : null}
              {/* Ambient */}
              <ShipCard id="PR #429" title="Refactor payments retry"          state="Deployed" />
              <ShipCard id="PR #428" title="Cache invalidation on plan change" state="Merged" />
            </div>
          </section>

          {/* YOUR REVIEW rail */}
          <aside className="min-w-0 flex flex-col rounded-xl border border-border/40 bg-card/50 p-3 backdrop-blur">
            <LaneHeader name="Your review" hint="Stops here, waits for you" />
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {showApproval ? (
                <ToolApprovalCallout
                  approval={{
                    id: 'demo-approval-432',
                    agentName: 'Anvil',
                    toolSlug: 'open-pr-with-changes',
                    toolName: 'PR #432 — Fix mobile sign-in button',
                    argsJson: {
                      repo: 'acme/web',
                      branch: 'fix/mobile-signin',
                      title: 'Fix mobile sign-in button',
                      checks: '12 passed',
                      tests: '142 / 142',
                      changedFiles: 2,
                    },
                  }}
                  isSubmitting={false}
                  onApproveOnce={advance}
                  onAlwaysAllow={() => undefined}
                  onDeny={rewind}
                />
              ) : beat < 4 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="h-10 w-10 rounded-full border border-border/40 bg-muted/30 flex items-center justify-center mb-3">
                    <Icon name="check" className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                  <p className="text-xs text-muted-foreground/60">All clear — nothing waiting on you.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="h-10 w-10 rounded-full border border-emerald-500/40 bg-emerald-500/15 flex items-center justify-center mb-3">
                    <Icon name="check" className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="text-xs text-muted-foreground/70">Approved. Shipping.</p>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Bottom ambient: Growth / Ops chips for beat 7 */}
        <div
          className={cn(
            'flex-none flex items-center gap-2 px-5 pb-4 transition-opacity duration-700',
            beat >= 7 ? 'opacity-100' : 'opacity-30'
          )}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">Other rooms</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-2.5 py-1 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
            Growth · drafting next experiment
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-2.5 py-1 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Ops · weekly invoice run
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground/40 font-mono">
            press Space to advance
          </span>
        </div>
      </div>
    </div>
  )
}
