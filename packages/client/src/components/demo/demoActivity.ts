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
      action: 'Triaging login issue ticket from Priya R.',
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
  // Deploy only after the merge lands (beat 11+).
  if (beat >= 11) out.push({
    id: 'e-deploy', agent: 'Marshall: Release Engineer', state: beat >= 12 ? 'done' : 'working', at: (beat - (beat >= 12 ? 12 : 11)) * 30,
    action: 'Deploying PR #432 to production',
    detail: beat >= 12
      ? 'Build 4823 shipped, edge cache flushed, post-deploy smoke tests all green. Sign-in latency flat at 38ms p95.'
      : 'Build 4823 queued. Deploying to edge, flushing cache, and running post-deploy smoke tests.',
  })
  // The merge is GATED on your approval at the pivot (beat 9). It does not
  // happen on its own — it waits, then lands on your yes (beat 10), then closes.
  if (beat >= 9) {
    const merged = beat >= 11
    const merging = beat >= 10
    out.push({
      id: 'e-merge', agent: 'Mason: Software Engineer',
      state: merged ? 'done' : beat === 9 ? 'needs-you' : 'working',
      at: (beat - (merged ? 11 : merging ? 10 : 9)) * 30,
      action: 'Merging fix/mobile-signin to main',
      detail: merged
        ? 'Squash-merged onto main, branch deleted, linked ticket #1042 auto-closed. Picking up the next item from the engineering backlog now.'
        : merging
          ? 'You approved the merge. Squash-merging onto main and kicking off the production deploy.'
          : 'All 12 checks green and the full suite passed on a real checkout. Holding for your okay before it lands on main.',
    })
  }
  if (beat >= 8) out.push({
    id: 'e-review', agent: 'Clara: Code Review', state: beat >= 9 ? 'done' : 'working', at: (beat - (beat >= 9 ? 9 : 8)) * 30,
    action: 'Reviewing PR #432',
    detail: beat >= 9
      ? 'Diff is tight: a stale-ref guard plus a regression test that fails without the fix. No blocking comments. Approved.'
      : 'Reading the diff on fix/mobile-signin — checking the stale-ref guard holds across orientation changes and the regression test actually reproduces the original failure.',
  })
  if (beat >= 8) out.push({
    id: 'e-open', agent: 'Mason: Software Engineer', state: 'done', at: (beat - 8) * 30,
    action: 'Opened PR #432',
    detail: 'Pushed fix/mobile-signin and opened the PR. All 12 checks green, diff +38 −4 across 2 files.',
  })
  if (beat >= 6) out.push({
    id: 'e-tests', agent: 'Mason: Software Engineer', state: beat >= 7 ? 'done' : 'working', at: (beat - (beat >= 7 ? 7 : 6)) * 30,
    action: 'Running tests on fix/mobile-signin',
    detail: beat >= 7
      ? 'All 142 tests passed in 24.3 seconds. The new Safari-resize regression test passes cleanly. Pushing the branch now.'
      : 'Spinning up iOS Safari at 390×844, replaying the resize sequence. 47 of 142 tests passed so far. Estimated 18 more seconds before the regression test runs.',
  })
  if (beat >= 5) out.push({
    id: 'e-fix', agent: 'Mason: Software Engineer', state: beat >= 6 ? 'done' : 'working', at: (beat - (beat >= 6 ? 6 : 5)) * 30,
    action: 'Implementing fix for mobile sign-in',
    detail: beat >= 6
      ? 'Three-line change inside SignInButton.tsx — guarding the resize handler against a stale ref. Wrote a regression test that reproduces the original failure before the fix.'
      : 'Patching the stale handler ref inside SignInButton.tsx. Writing a regression test that reproduces the original failure before applying the fix.',
  })
  if (beat >= 4) out.push({
    id: 'e-spec', agent: 'Drew: Tech Lead', state: beat >= 5 ? 'done' : 'working', at: (beat - (beat >= 5 ? 5 : 4)) * 30,
    action: 'Scoping ticket #1042',
    detail: beat >= 5
      ? 'Reproduced on iPhone 14 Pro Safari at 390×844. The button stops responding after a viewport resize because the handler ref is captured before the resize, not after. Acceptance: button stays responsive across orientation and resize.'
      : 'Reproducing on iPhone 14 Pro Safari at 390×844. Tracing the resize event timing to pin down why the handler ref goes stale after orientation change.',
  })
  return out
}

export function growthActivity(beat: number): DemoActivityItem[] {
  const out: DemoActivityItem[] = []
  if (beat >= 8) out.push({
    id: 'g-handover', agent: 'Mercer: Outreach Lead', state: beat >= 9 ? 'done' : 'working', at: (beat - (beat >= 9 ? 9 : 8)) * 30,
    action: 'Handing over the Q2 outbound list',
    detail: '1,240 target accounts, 3,800 contacts, 3,640 verified emails. Clean list ready for outreach — staged for your sign-off before the first send.',
  })
  if (beat >= 7) out.push({
    id: 'g-qa', agent: 'Mira: List QA', state: beat >= 8 ? 'done' : 'working', at: (beat - (beat >= 8 ? 8 : 7)) * 30,
    action: 'QA on the verified contact list',
    detail: beat >= 8
      ? 'Spot-checked 200 rows against source pages — no fabricated names or titles, every email maps to a real person. List passes.'
      : 'Sampling the verified list to confirm every name, title, and company is grounded in a real source. Zero tolerance for fabricated contacts.',
  })
  if (beat >= 5) out.push({
    id: 'g-verify', agent: 'Vera: Email Verification', state: beat >= 7 ? 'done' : 'working', at: (beat - (beat >= 7 ? 7 : 5)) * 30,
    action: 'Verifying contact emails',
    detail: beat >= 7
      ? '3,640 of 3,800 emails verified deliverable. Dropped 160 catch-all and bounced addresses.'
      : 'Running deliverability checks across 3,800 contacts — MX, SMTP, and catch-all detection. About 96% verifying clean so far.',
  })
  if (beat >= 3) out.push({
    id: 'g-contacts', agent: 'Hunter: Contact Sourcing', state: beat >= 5 ? 'done' : 'working', at: (beat - (beat >= 5 ? 5 : 3)) * 30,
    action: 'Finding contacts at target accounts',
    detail: beat >= 5
      ? 'Found 3,800 decision-makers across 1,240 accounts — VP Eng, Head of Support, and Founder titles prioritised.'
      : 'Pulling decision-makers at each target account, prioritising VP Eng, Head of Support, and Founder titles.',
  })
  if (beat >= 1) out.push({
    id: 'g-tam', agent: 'Carter: Market Research', state: beat >= 3 ? 'done' : 'working', at: (beat - (beat >= 3 ? 3 : 1)) * 30,
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

