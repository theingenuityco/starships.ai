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
 *
 * TIMELINE (one animation per beat, with one deliberate bundling): every
 * conversation row, indicator-only card update, and gate transition sits on
 * its own beat. The exception is a card status/assignee change AND its
 * matching task-board log entry, which share a beat because they're the same
 * logical action (the card flipping to TRIAGED and the "Sara moved #1042 to
 * Triaged" log line are one moment, not two). Full sequence:
 *
 *   1  g-tam appears (Nisha, working)
 *   2  Growth card appears (BUILDING TAM) + tb-g-create log
 *   3  s-watch appears (Sara, working)
 *   4  s-arrival appears (Sara, working)
 *   5  s-watch → done
 *   6  Support card appears (NEW) + tb-s-create log
 *   7  g-tam → done
 *   8  Growth card → FINDING CONTACTS + "1,240 accounts"
 *   9  e-plan appears (Avery, working)
 *  10  s-arrival → done
 *  11  Support card → TRIAGED + indicators + tb-s-triage log
 *  12  Engineering card appears (SCOPED, Avery) + tb-e-create log
 *  13  Growth card → VERIFYING + "3,800 contacts"
 *  14  e-plan → done
 *  15  Engineering card → BUILDING + git-branch, Mason + tb-e-assign-mason log
 *  16  e-fix appears (Mason, working)
 *  17  Growth card adds "3,640 verified"
 *  18  Growth card → QA, Otis + tb-g-assign-otis log
 *  19  g-verify appears (Otis, working)
 *  20  e-fix → done
 *  21  Engineering card adds "142 / 142 tests"
 *  22  Engineering card → IN REVIEW + "12 checks" + tb-e-review log
 *  23  g-verify → done
 *  24  Growth card → LIST READY + tb-g-ready log
 *  25  Engineering card assignee → Ravi + tb-e-assign-ravi log
 *  26  e-review appears (Ravi, working)
 *  27  s-reply appears (Sara, working — drafting)
 *  28  e-review → needs-you (review complete, gate)
 *  29  Engineering card → READY TO MERGE (needsYou)
 *  30  s-reply → needs-you (draft ready, gate)
 *  31  Support card → REPLY READY (needsYou)
 *  32  s-reply → working (sending, post-approve)
 *  33  Support card → REPLYING (gate clears)
 *  34  e-review → working (merging, post-approve)
 *  35  Engineering card → MERGING (gate clears)
 *  36  s-reply → done
 *  37  Support card → RESOLVED + tb-s-resolve log
 *  38  e-review → done
 *  39  Engineering card → MERGED + tb-e-merge log
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
  // s-reply: appears beat 27 (drafting), → needs-you beat 30 (draft ready),
  // → working beat 32 (sending after approval), → done beat 36 (sent).
  if (beat >= 27) {
    const sent = beat >= 36
    const sending = beat >= 32
    const ready = beat >= 30
    const state: DemoActivityState = sent ? 'done' : sending ? 'working' : ready ? 'needs-you' : 'working'
    const eventBeat = sent ? 36 : sending ? 32 : ready ? 30 : 27
    const detail = sent
      ? 'Reply sent confirming the mobile sign-in fix has shipped. Ticket #1042 closed and resolved_at stamped.'
      : sending
        ? 'You approved the reply. Sending it to Priya now and closing the ticket.'
        : ready
          ? 'Draft is ready: confirms the mobile sign-in fix is shipping and thanks her for the clear repro. Holding for your okay before it goes out.'
          : 'Writing a reply tied to Priya\'s exact issue and the specific fix, no filler. Will hold for your approval before anything sends.'
    out.push({
      id: 's-reply', agent: 'Sara: Customer Support',
      state, at: (beat - eventBeat) * 30,
      action: 'Replying to Priya R. on #1042',
      detail,
    })
  }
  // s-arrival: appears beat 4 (ticket lands), → done beat 10 (triage finished).
  if (beat >= 4) {
    const triaged = beat >= 10
    out.push({
      id: 's-arrival', agent: 'Sara: Customer Support',
      state: triaged ? 'done' : 'working',
      at: triaged ? (beat - 10) * 30 : (beat - 4) * 30,
      action: 'Triaging mobile login issue from Priya R.',
      detail: 'Subject: Can\'t log in on mobile. Body: "Sign in button does nothing on iPhone Safari, tried Chrome too, no luck. This started after the update yesterday."',
    })
  }
  // s-watch: appears beat 3 (watching inbox), → done beat 5 (handed off to triage).
  if (beat >= 3) out.push({
    id: 's-watch', agent: 'Sara: Customer Support',
    state: beat >= 5 ? 'done' : 'working',
    at: beat >= 5 ? (beat - 5) * 30 : (beat - 3) * 30,
    action: 'Checking for new support tickets',
    detail: beat >= 5
      ? 'Found a new ticket from Priya R. in the queue. Handed off to receive and triage.'
      : 'Watching the support inbox and connected channels for new tickets. Queue is clear right now; ready to receive and triage the moment one lands.',
  })
  return out
}

export function engineeringActivity(beat: number): DemoActivityItem[] {
  const out: DemoActivityItem[] = []
  // e-review: appears beat 26 (Ravi starts review), → needs-you beat 28 (review
  // done, holding for approval), → working beat 34 (merging after approval),
  // → done beat 38 (merged).
  if (beat >= 26) {
    const merged = beat >= 38
    const merging = beat >= 34
    const ready = beat >= 28
    const state: DemoActivityState = merged ? 'done' : merging ? 'working' : ready ? 'needs-you' : 'working'
    const eventBeat = merged ? 38 : merging ? 34 : ready ? 28 : 26
    const detail = merged
      ? 'Squash-merged onto main, branch deleted, linked ticket #1042 auto-closed. Picking up the next item from the engineering backlog now.'
      : merging
        ? 'You approved the merge. Squash-merging fix/mobile-signin onto main and kicking off the production deploy.'
        : ready
          ? 'Reviewed the diff and the regression test: the fix is tight and all 12 checks are green. Holding for your okay before it lands on main.'
          : 'Walking through the diff and the regression test before signing off. Initial read: tight three-line fix, all checks green.'
    out.push({
      id: 'e-review', agent: 'Ravi: Release Engineer',
      state, at: (beat - eventBeat) * 30,
      action: 'Reviewing and merging fix/mobile-signin',
      detail,
    })
  }
  // e-fix: Mason implements from Avery's plan. Appears beat 16, done beat 20.
  if (beat >= 16) out.push({
    id: 'e-fix', agent: 'Mason: Product Engineer',
    state: beat >= 20 ? 'done' : 'working',
    at: (beat - (beat >= 20 ? 20 : 16)) * 30,
    action: 'Implementing fix for mobile sign-in',
    detail: beat >= 20
      ? 'Three-line fix in SignInButton.tsx guarding the resize handler against a stale ref, plus a regression test that fails without it. Opened PR fix/mobile-signin: all 12 checks green.'
      : 'Following the plan: writing a regression test that reproduces the failure first, then patching the stale handler ref in SignInButton.tsx.',
  })
  // e-plan: Avery scopes the bug from the support ticket. Appears beat 9, done beat 14.
  if (beat >= 9) out.push({
    id: 'e-plan', agent: 'Avery: Product Manager',
    state: beat >= 14 ? 'done' : 'working',
    at: (beat - (beat >= 14 ? 14 : 9)) * 30,
    action: 'Scoping the mobile sign-in issue',
    detail: beat >= 14
      ? 'Root cause isolated to a stale resize-handler ref in SignInButton.tsx. Wrote up the fix plan and handed it to engineering.'
      : 'Reproducing Priya R.\'s report and tracing where mobile Safari sign-in breaks. Will write up the root cause and a fix plan for engineering.',
  })
  return out
}

export function growthActivity(beat: number): DemoActivityItem[] {
  const out: DemoActivityItem[] = []
  // g-verify: Otis runs final QA on the verified contact list. Appears beat 19, done beat 23.
  if (beat >= 19) out.push({
    id: 'g-verify', agent: 'Otis: Lead Enrichment',
    state: beat >= 23 ? 'done' : 'working',
    at: (beat - (beat >= 23 ? 23 : 19)) * 30,
    action: 'Running final QA on the contact list',
    detail: beat >= 23
      ? 'Spot-checked deliverability on a sample, deduped against existing pipeline, and tagged owners. List is clean and approved for outreach.'
      : 'Spot-checking deliverability on a sample, deduplicating against existing pipeline, and tagging owners before sign-off.',
  })
  // g-tam: Nisha builds the target account list. Appears beat 1, done beat 7.
  if (beat >= 1) out.push({
    id: 'g-tam', agent: 'Nisha: Lead Generation',
    state: beat >= 7 ? 'done' : 'working',
    at: (beat - (beat >= 7 ? 7 : 1)) * 30,
    action: 'Building the target account list',
    detail: beat >= 7
      ? 'Expanded the ICP into 1,240 accounts: B2B SaaS, 50-500 employees, with recent funding or hiring signals.'
      : 'Expanding the ideal customer profile into a target account list: filtering B2B SaaS, 50-500 employees, with recent funding or hiring signals.',
  })
  return out
}

/**
 * An activity item already tagged with its room. Used for the global Mission
 * Control log when an item doesn't belong to one of the per-room conversation
 * builders above — e.g. task-board actions.
 */
export type DemoGlobalActivityItem = DemoActivityItem & {
  room: 'Support' | 'Engineering' | 'Growth'
  /** Discriminates board actions from conversation activity so the log can render them as muted one-liners. */
  kind: 'board'
}

/**
 * Task-board activity for the Mission Control log: the agents creating task
 * cards, reassigning them, and moving them between columns as the story
 * unfolds. Kept SEPARATE from the per-room conversation builders above so it
 * only feeds the Mission Control activity log, never the nav sidebar's nested
 * conversation list (these are board actions, not conversations).
 *
 * Each log entry shares its beat with the corresponding feed-card status
 * change (see file header), so the card flip and the log line land together
 * as one logical action. Entries are discrete and land as `done` (at === 0 →
 * "now"), then recede into the timeline. `action` is past-tense so the line
 * reads as "{agent} {action}".
 */
export function taskBoardActivity(beat: number): DemoGlobalActivityItem[] {
  const out: DemoGlobalActivityItem[] = []
  const ev = (
    fromBeat: number,
    room: 'Support' | 'Engineering' | 'Growth',
    id: string,
    agent: string,
    action: string,
    detail: string
  ) => {
    if (beat >= fromBeat) out.push({ id, agent, room, action, detail, kind: 'board', state: 'done', at: (beat - fromBeat) * 30 })
  }

  // Growth Pipeline — Q2 outbound list.
  ev(2, 'Growth', 'tb-g-create', 'Nisha: Lead Generation',
    'created the Q2 outbound pipeline card',
    'Opened "Build the Q2 outbound pipeline" on the Growth Pipeline and started the TAM build.')

  // Support Tickets board — ticket #1042 (Priya R.).
  ev(6, 'Support', 'tb-s-create', 'Sara: Customer Support',
    'opened ticket #1042 on the Support Tickets board',
    'Created a card for Priya R.\'s login issue and dropped it in the New column.')
  ev(11, 'Support', 'tb-s-triage', 'Sara: Customer Support',
    'moved #1042 to Triaged',
    'Tagged it bug · mobile · auth, set priority to high, and kept it assigned to herself.')

  // Engineering Pipeline — fix/mobile-signin.
  ev(12, 'Engineering', 'tb-e-create', 'Avery: Product Manager',
    'opened fix/mobile-signin on the Engineering Pipeline',
    'Created the card from ticket #1042 with the root-cause writeup and fix plan, in the Scoped column.')
  ev(15, 'Engineering', 'tb-e-assign-mason', 'Avery: Product Manager',
    'assigned fix/mobile-signin to Mason',
    'Handed the card to engineering and moved it into Building.')

  // Growth assignment handoff.
  ev(18, 'Growth', 'tb-g-assign-otis', 'Nisha: Lead Generation',
    'assigned the Q2 outbound list to Otis',
    'Contacts verified, so she handed the card to enrichment and moved it into QA.')

  // Engineering PR opened and ready for review.
  ev(22, 'Engineering', 'tb-e-review', 'Mason: Product Engineer',
    'moved fix/mobile-signin to In Review',
    'Opened the PR with the fix and regression test, then moved the card to In Review.')

  // Growth list ready for outreach.
  ev(24, 'Growth', 'tb-g-ready', 'Otis: Lead Enrichment',
    'moved the Q2 outbound list to List Ready',
    '3,640 verified contacts handed off; moved the card to List Ready for outreach.')

  // Engineering review handoff.
  ev(25, 'Engineering', 'tb-e-assign-ravi', 'Mason: Product Engineer',
    'assigned fix/mobile-signin to Ravi',
    'All 12 checks green, so he handed the card to release for the merge review.')

  // Resolution logs.
  ev(37, 'Support', 'tb-s-resolve', 'Sara: Customer Support',
    'moved #1042 to Resolved',
    'Closed the ticket card now that the fix shipped and the reply is sent.')
  ev(39, 'Engineering', 'tb-e-merge', 'Ravi: Release Engineer',
    'moved fix/mobile-signin to Merged',
    'Squash-merged onto main and moved the card to Merged; ticket #1042 auto-closed.')

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
