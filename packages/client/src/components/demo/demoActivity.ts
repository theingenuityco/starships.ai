/**
 * demoActivity — the single source of truth for the hero-video demo's per-room
 * activity. Each item is one conversation (or sub-conversation) driven by an
 * agent in a room, keyed off the demo beat clock.
 *
 * Both surfaces read from here so they never drift:
 *   - Mission Control's unified activity log (mission-control/page.tsx)
 *   - the navigation sidebar's nested conversation list under each room
 *
 * The builders are pure functions of `beat` — no network, no DB. Inert for real
 * users (only consumed when the demo clock is active).
 */

export type DemoActivityState = 'done' | 'working' | 'needs-you'

export type DemoActivityItem = {
  id: string
  agent: string
  /** What's happening — used as the conversation title. */
  action: string
  /** Longer preview line (mirrors a conversation's last message). */
  detail?: string
  state: DemoActivityState
  /** Seconds ago. 0 = now. Smaller = more recent. */
  at: number
}

export type DemoRoomKey = 'support' | 'engineering' | 'growth'

/** UI status the sidebar indicator renders. */
export type DemoConvStatus = 'live' | 'needs-you' | 'done' | 'idle'

/**
 * Map an activity item to the sidebar's status indicator vocabulary.
 * `done` is transient: it only flags on the beat the item completes (`at === 0`),
 * so blue dots don't accumulate — once a stage advances, a finished item reverts
 * to a normal conversation (idle → no marker, just the convo icon).
 */
export function activityStatus(state: DemoActivityState, at: number): DemoConvStatus {
  if (state === 'needs-you') return 'needs-you'
  if (state === 'working') return 'live'
  if (state === 'done' && at === 0) return 'done'
  return 'idle'
}

export function supportActivity(beat: number): DemoActivityItem[] {
  const out: DemoActivityItem[] = []
  // Sara drafts the customer response, then waits on you at the pivot (beat 9),
  // sends on approval (beat 10), and confirms sent (beat 11).
  if (beat >= 8) {
    const sent = beat >= 11
    const sending = beat >= 10
    out.push({
      id: 's-reply', agent: 'Sara: Customer Support',
      state: sent ? 'done' : beat === 9 ? 'needs-you' : 'working',
      at: (beat - (sent ? 11 : sending ? 10 : beat >= 9 ? 9 : 8)) * 30,
      action: 'Replying to Priya R. on #1042',
      detail: sent
        ? 'Reply sent confirming the mobile sign-in fix has shipped. Ticket #1042 closed and resolved_at stamped.'
        : sending
          ? 'You approved the reply. Sending it to Priya now and closing the ticket.'
          : beat === 9
            ? 'Draft is ready: confirms the mobile sign-in fix is shipping and thanks her for the clear repro. Holding for your okay before it goes out.'
            : 'Writing a reply tied to Priya\'s exact issue and the specific fix — no filler. Will hold for your approval before anything sends.',
    })
  }
  // Opens on beat 2: beat 1 belongs to the Growth TAM card alone. The ticket
  // first lands in "Running now" as it's received (beat 2), then settles into
  // the timeline as a delivered ticket the next beat (beat 3+).
  if (beat >= 2) {
    const received = beat >= 3
    out.push({
      id: 's-arrival', agent: 'Sara: Customer Support',
      state: received ? 'done' : 'working',
      at: received ? (beat - 3) * 30 : 0,
      action: 'Triaging mobile login issue from Priya R.',
      detail: 'Subject: Can\'t log in on mobile. Body: "Sign in button does nothing on iPhone Safari, tried Chrome too, no luck. This started after the update yesterday."',
    })
  }
  // From the very start (beat 1) Sara watches the inbox for incoming tickets —
  // the only Support activity in the opening state, pairing with Growth's TAM
  // build. Completes the moment a ticket lands (beat 2), handing off to s-arrival.
  if (beat >= 1) out.push({
    id: 's-watch', agent: 'Sara: Customer Support', state: beat >= 2 ? 'done' : 'working', at: beat >= 2 ? (beat - 2) * 30 : 0,
    action: 'Checking for new support tickets',
    detail: beat >= 2
      ? 'Found a new ticket from Priya R. in the queue — handing off to receive and triage.'
      : 'Watching the support inbox and connected channels for new tickets. Queue is clear right now; ready to receive and triage the moment one lands.',
  })
  return out
}

export function engineeringActivity(beat: number): DemoActivityItem[] {
  const out: DemoActivityItem[] = []
  // Beat 9 is the pivot: the review is GATED on your approval. The reviewer
  // holds, merges on your yes (beat 10), then it lands and closes out (beat 11).
  if (beat >= 9) {
    const merged = beat >= 11
    const merging = beat >= 10
    out.push({
      id: 'e-review', agent: 'Ravi: Release Engineer',
      state: merged ? 'done' : beat === 9 ? 'needs-you' : 'working',
      at: (beat - (merged ? 11 : merging ? 10 : 9)) * 30,
      action: 'Reviewing and merging fix/mobile-signin',
      detail: merged
        ? 'Squash-merged onto main, branch deleted, linked ticket #1042 auto-closed. Picking up the next item from the engineering backlog now.'
        : merging
          ? 'You approved the merge. Squash-merging fix/mobile-signin onto main and kicking off the production deploy.'
          : 'Reviewed the diff and the regression test: the fix is tight and all 12 checks are green. Holding for your okay before it lands on main.',
    })
  }
  // The product engineer implements against the plan, writing a failing
  // regression test first, then raises the PR once the suite is green.
  if (beat >= 5) out.push({
    id: 'e-fix', agent: 'Mason: Product Engineer', state: beat >= 7 ? 'done' : 'working', at: (beat - (beat >= 7 ? 7 : 5)) * 30,
    action: 'Implementing fix for mobile sign-in',
    detail: beat >= 7
      ? 'Three-line fix in SignInButton.tsx guarding the resize handler against a stale ref, plus a regression test that fails without it. Opened PR fix/mobile-signin: all 12 checks green.'
      : 'Following the plan: writing a regression test that reproduces the failure first, then patching the stale handler ref in SignInButton.tsx.',
  })
  // The product manager scopes the bug from the support ticket, reproduces it,
  // and hands engineering a root-cause writeup and a fix plan.
  if (beat >= 3) out.push({
    id: 'e-plan', agent: 'Avery: Product Manager', state: beat >= 5 ? 'done' : 'working', at: (beat - (beat >= 5 ? 5 : 3)) * 30,
    action: 'Scoping the mobile sign-in issue',
    detail: beat >= 5
      ? 'Root cause isolated to a stale resize-handler ref in SignInButton.tsx. Wrote up the fix plan and handed it to engineering.'
      : 'Reproducing Priya R.\'s report and tracing where mobile Safari sign-in breaks. Will write up the root cause and a fix plan for engineering.',
  })
  return out
}

export function growthActivity(beat: number): DemoActivityItem[] {
  const out: DemoActivityItem[] = []
  if (beat >= 7) out.push({
    id: 'g-verify', agent: 'Otis: Lead Enrichment', state: beat >= 9 ? 'done' : 'working', at: (beat - (beat >= 9 ? 9 : 7)) * 30,
    action: 'Verifying contact emails',
    detail: beat >= 9
      ? '3,640 of 3,800 emails verified deliverable. Dropped 160 catch-all and bounced addresses.'
      : 'Running deliverability checks across 3,800 contacts — MX, SMTP, and catch-all detection. About 96% verifying clean so far.',
  })
  if (beat >= 1) out.push({
    id: 'g-tam', agent: 'Nisha: Lead Generation', state: beat >= 3 ? 'done' : 'working', at: (beat - (beat >= 3 ? 3 : 1)) * 30,
    action: 'Building the target account list',
    detail: beat >= 3
      ? 'Expanded the ICP into 1,240 accounts — B2B SaaS, 50-500 employees, with recent funding or hiring signals.'
      : 'Expanding the ideal customer profile into a target account list — filtering B2B SaaS, 50-500 employees, with recent funding or hiring signals.',
  })
  return out
}

const BUILDERS: Record<DemoRoomKey, (beat: number) => DemoActivityItem[]> = {
  support: supportActivity,
  engineering: engineeringActivity,
  growth: growthActivity,
}

/** Map a room slug (incl. bundle aliases) to its demo activity key. */
function roomKeyForSlug(roomSlug: string): DemoRoomKey | null {
  const s = String(roomSlug || '').trim().toLowerCase()
  if (s === 'support') return 'support'
  if (s === 'engineering' || s === 'eng') return 'engineering'
  if (s === 'growth' || s === 'leadgen' || s === 'lead-generation') return 'growth'
  return null
}

export function isDemoRoomSlug(roomSlug: string): boolean {
  return roomKeyForSlug(roomSlug) !== null
}

/** The room's activity at a given beat, most-recent first. */
export function demoRoomActivity(roomSlug: string, beat: number): DemoActivityItem[] {
  const key = roomKeyForSlug(roomSlug)
  if (!key) return []
  return BUILDERS[key](beat).slice().sort((a, b) => a.at - b.at)
}

/**
 * The room's attention status for the nav sidebar dot: a single marker shown
 * only when something in the room is gated on you (`needs-you`) or just
 * completed this beat (`done`). `needs-you` wins when both are present, since
 * it's the more urgent signal. Returns 'idle' when there's nothing to flag, so
 * the dot collapses cleanly. Mirrors the transient-done semantics in activityStatus.
 */
export function demoRoomAttentionStatus(roomSlug: string, beat: number): DemoConvStatus {
  const statuses = demoRoomActivity(roomSlug, beat).map((i) => activityStatus(i.state, i.at))
  if (statuses.includes('needs-you')) return 'needs-you'
  if (statuses.includes('done')) return 'done'
  return 'idle'
}

