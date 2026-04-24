'use client'

/**
 * Dashboard preview page — renders the three dashboard columns with static mock data.
 * Useful for visually inspecting the filled layout without a live backend.
 * Visit: /ship/<any-slug>/dashboard/preview
 */

import React, { useState } from 'react'
import { notFound } from 'next/navigation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { GoalsColumn } from '@/components/dashboard/GoalsColumn'
import { AgentActivityColumn } from '@/components/dashboard/AgentActivityColumn'
import { ApprovalsPanel } from '@/components/dashboard/ApprovalsPanel'

// ─── Mock IDs ────────────────────────────────────────────────────────────────

const DEMO_ID = 'DEMO_STARSHIP'

const ROOM_CONV_1 = 'room-conv-marketing'
const ROOM_CONV_2 = 'room-conv-content'
const ROOM_CONV_3 = 'room-conv-growth'

const CHILD_CONV_WITH_APPROVAL = 'child-conv-approval-1'

const BOARD_1_ID = 'board-q2-launch'
const BOARD_2_ID = 'board-content-pipeline'

const COL_TODO = 'col-todo'
const COL_IN_PROGRESS = 'col-in-progress'
const COL_REVIEW = 'col-review'
const COL_DONE = 'col-done'

// ─── Mock Data ───────────────────────────────────────────────────────────────

const now = Date.now()
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString()
const hoursAgo = (h: number) => minsAgo(h * 60)
const daysAgo = (d: number) => hoursAgo(d * 24)

const MOCK_ROOMS = {
  rooms: [
    { id: 'r1', conversationId: ROOM_CONV_1, slug: 'marketing', name: 'Marketing', starshipId: DEMO_ID, createdAt: daysAgo(30), updatedAt: daysAgo(1) },
    { id: 'r2', conversationId: ROOM_CONV_2, slug: 'content', name: 'Content', starshipId: DEMO_ID, createdAt: daysAgo(20), updatedAt: hoursAgo(2) },
    { id: 'r3', conversationId: ROOM_CONV_3, slug: 'growth', name: 'Growth', starshipId: DEMO_ID, createdAt: daysAgo(15), updatedAt: minsAgo(45) },
  ],
}

const MOCK_CONVERSATIONS = {
  conversations: [
    // ── Running now ──
    {
      id: 'conv-live-1',
      title: 'Drafting Q2 email campaign for SaaS trial users',
      status: 'active',
      hasActiveTurn: true,
      parentConversationId: ROOM_CONV_1,
      createdAt: minsAgo(8),
      updatedAt: minsAgo(1),
      agents: [{ id: 'agent-1', name: 'Maya', slug: 'maya' }],
      lastMessage: { content: "I've pulled the full segment data for trial users who signed up in the last 30 days and cross-referenced with their activation events. I'm now writing five subject line variants — two urgency-led, two curiosity-led, and one social-proof variant based on the 3× open rate lift you mentioned from the March send. I'll also draft the preview text for each so you can A/B test the pair together in Mailchimp.", agentName: 'Maya', createdAt: minsAgo(1) },
    },
    {
      id: 'conv-live-2',
      title: 'Generating SEO-optimised blog posts from product changelog',
      status: 'active',
      hasActiveTurn: true,
      parentConversationId: ROOM_CONV_2,
      createdAt: minsAgo(22),
      updatedAt: minsAgo(3),
      agents: [{ id: 'agent-2', name: 'Kai', slug: 'kai' }],
      lastMessage: { content: "Found 12 changelog entries since the last publish. I'm clustering them into three themes — performance improvements (4 entries), new third-party integrations (5 entries), and UI/UX updates (3 entries). Each cluster will become its own section in the post with a short intro, bullet summary, and a real-world impact sentence. Starting with the integrations cluster since that tends to drive the most organic search traffic.", agentName: 'Kai', createdAt: minsAgo(3) },
    },
    {
      id: 'conv-live-3',
      title: 'Researching competitor pricing pages and summarising findings',
      status: 'active',
      hasActiveTurn: true,
      parentConversationId: ROOM_CONV_3,
      createdAt: minsAgo(15),
      updatedAt: minsAgo(2),
      agents: [{ id: 'agent-3', name: 'Scout', slug: 'scout' }],
      lastMessage: { content: "Scraped 6 of 8 competitor pricing pages successfully. Mailchimp and HubSpot both gate their automation features behind mid-tier plans ($20–45/mo), while Klaviyo uses a contact-count model with no hard feature ceiling. Still working through ActiveCampaign and Drip — their pages use JavaScript-rendered pricing tables that require a second pass. Comparison table is taking shape with columns for price, contact limits, automation depth, AI features, and API access.", agentName: 'Scout', createdAt: minsAgo(2) },
    },
    {
      id: 'conv-live-4',
      title: 'Rewriting onboarding email sequence for new free tier',
      status: 'active',
      hasActiveTurn: true,
      parentConversationId: ROOM_CONV_1,
      createdAt: minsAgo(31),
      updatedAt: minsAgo(4),
      agents: [{ id: 'agent-4', name: 'Aria', slug: 'aria' }],
      lastMessage: { content: "Reviewed the existing 6-email sequence. Emails 3 and 5 reference Pro features that free-tier users can't access — rewriting those to lead with value they already have, then soft-pitch the upgrade. Tone target: helpful and direct, not pushy.", agentName: 'Aria', createdAt: minsAgo(4) },
    },
    {
      id: 'conv-live-5',
      title: 'Summarising last week\'s product changelog for the team digest',
      status: 'active',
      hasActiveTurn: true,
      parentConversationId: ROOM_CONV_2,
      createdAt: minsAgo(5),
      updatedAt: minsAgo(1),
      agents: [{ id: 'agent-2', name: 'Kai', slug: 'kai' }],
      lastMessage: { content: "Pulled 9 merged PRs from last week. Grouping into: 3 bug fixes, 4 feature improvements, 2 infrastructure changes. Writing a one-liner summary per item in plain language — no jargon, aimed at non-technical stakeholders.", agentName: 'Kai', createdAt: minsAgo(1) },
    },

    // ── Last hour ──
    {
      id: 'conv-h1',
      title: 'Social media copy for product launch announcement',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_1,
      createdAt: minsAgo(55),
      updatedAt: minsAgo(40),
      agents: [{ id: 'agent-1', name: 'Maya', slug: 'maya' }],
      lastMessage: { content: "Here are the 5 social post variants across LinkedIn, Twitter/X, and Instagram. The LinkedIn version opens with the ROI stat (\"teams cut campaign turnaround by 60%\") and follows with three supporting bullets. The Twitter version is a 4-tweet thread starting with a provocative hook. The Instagram caption is shorter and leans into the behind-the-scenes angle with two hashtag clusters — one branded, one discovery-focused. Let me know if you want tone adjustments on any of them.", agentName: 'Maya', createdAt: minsAgo(40) },
    },
    {
      id: 'conv-h2',
      title: 'Analysing open-rate data from last 3 campaigns',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_1,
      createdAt: minsAgo(50),
      updatedAt: minsAgo(35),
      agents: [{ id: 'agent-4', name: 'Aria', slug: 'aria' }],
      lastMessage: { content: "Average open rate across the three campaigns was 24.7%, which sits above the 21.3% industry benchmark for SaaS. The Tuesday 10am send window significantly outperformed other slots — 31.2% open rate vs 19.8% for Friday afternoon sends. Subject lines with a number in the first 3 words averaged 4.1 percentage points higher. Click-to-open rate was strongest for the onboarding nudge campaign at 38%, suggesting that triggered sends outperform batch-and-blast by a wide margin.", agentName: 'Aria', createdAt: minsAgo(35) },
    },
    {
      id: 'conv-h3',
      title: 'LinkedIn thought-leadership article outline — AI in marketing',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_2,
      createdAt: minsAgo(48),
      updatedAt: minsAgo(30),
      agents: [{ id: 'agent-2', name: 'Kai', slug: 'kai' }],
      lastMessage: { content: "Outline ready: 5-section structure with a contrarian hook, 3 practical examples, and a CTA for the newsletter. Estimated 800-word read.", agentName: 'Kai', createdAt: minsAgo(30) },
    },
    {
      id: 'conv-h4',
      title: 'Scraping and categorising 200 inbound support tickets',
      status: 'paused',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_3,
      createdAt: minsAgo(58),
      updatedAt: minsAgo(25),
      agents: [{ id: 'agent-3', name: 'Scout', slug: 'scout' }],
      lastMessage: { content: "Processed and categorised 143 of 200 tickets. Top issue categories so far: billing confusion (31 tickets), onboarding drop-off (28), feature requests around bulk actions (22), and API rate limit complaints (19). The remaining 57 tickets are on pages 8–12 in Zendesk but I'm hitting a 403 on those — the export token I have only has read access up to page 7. Can you provide an admin token or export the remaining tickets as a CSV?", agentName: 'Scout', createdAt: minsAgo(25) },
    },

    // ── Earlier today ──
    {
      id: 'conv-t1',
      title: 'Building monthly newsletter from 5 recent blog posts',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_2,
      createdAt: hoursAgo(4),
      updatedAt: hoursAgo(3),
      agents: [{ id: 'agent-2', name: 'Kai', slug: 'kai' }],
      lastMessage: { content: "Newsletter draft complete. Intro paragraph hooks with last month's top stat. All 5 posts summarised in 2-3 sentences each with read-more links.", agentName: 'Kai', createdAt: hoursAgo(3) },
    },
    {
      id: 'conv-t2',
      title: 'Updating landing page copy to reflect new positioning',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_1,
      createdAt: hoursAgo(5),
      updatedAt: hoursAgo(4),
      agents: [{ id: 'agent-1', name: 'Maya', slug: 'maya' }],
      lastMessage: { content: "Updated the hero headline, sub-headline, and 3 feature bullets. Replaced 'automation tool' with 'AI marketing co-pilot' throughout.", agentName: 'Maya', createdAt: hoursAgo(4) },
    },
    {
      id: 'conv-t3',
      title: 'A/B test hypothesis for checkout abandonment flow',
      status: 'paused',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_3,
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(5),
      agents: [{ id: 'agent-4', name: 'Aria', slug: 'aria' }],
      lastMessage: { content: "Drafted 2 hypotheses. Waiting on conversion data from the last 90 days to validate baseline. Will resume once analytics access is confirmed.", agentName: 'Aria', createdAt: hoursAgo(5) },
    },
    {
      id: 'conv-t4',
      title: 'Generating 30-day social calendar with hashtag research',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_1,
      createdAt: hoursAgo(7),
      updatedAt: hoursAgo(6),
      agents: [{ id: 'agent-1', name: 'Maya', slug: 'maya' }],
      lastMessage: { content: "30-day calendar exported to Google Sheets. 4 posts/week across LinkedIn, Twitter, Instagram. Top hashtag clusters identified per platform.", agentName: 'Maya', createdAt: hoursAgo(6) },
    },
    {
      id: 'conv-t5',
      title: 'Writing FAQs for enterprise tier pricing page',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_2,
      createdAt: hoursAgo(9),
      updatedAt: hoursAgo(8),
      agents: [{ id: 'agent-2', name: 'Kai', slug: 'kai' }],
      lastMessage: { content: "12 FAQs written covering contracts, SSO, SLA, data residency, and onboarding. Tone is confident and direct — no marketing fluff.", agentName: 'Kai', createdAt: hoursAgo(8) },
    },

    // ── Yesterday ──
    {
      id: 'conv-y1',
      title: 'Competitive analysis: top 8 email marketing tools',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_3,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      agents: [{ id: 'agent-3', name: 'Scout', slug: 'scout' }],
      lastMessage: { content: "Analysis complete. Summary table covers pricing, free tier limits, AI features, and API access for all 8 tools. Key insight: only 2 offer native AI copywriting.", agentName: 'Scout', createdAt: daysAgo(1) },
    },
    {
      id: 'conv-y2',
      title: 'Customer interview summaries — product insight report',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_2,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      agents: [{ id: 'agent-4', name: 'Aria', slug: 'aria' }],
      lastMessage: { content: "Report synthesised from 14 interview transcripts. Top 3 themes: onboarding friction, missing Slack integration, and desire for bulk scheduling.", agentName: 'Aria', createdAt: daysAgo(1) },
    },
    {
      id: 'conv-y3',
      title: 'Outbound email sequence for cold-outreach trial (5 steps)',
      status: 'completed',
      hasActiveTurn: false,
      parentConversationId: ROOM_CONV_1,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      agents: [{ id: 'agent-1', name: 'Maya', slug: 'maya' }],
      lastMessage: { content: "5-step sequence written: Day 0 intro, Day 2 value prop, Day 5 case study, Day 8 objection handler, Day 12 breakup email. Each under 120 words.", agentName: 'Maya', createdAt: daysAgo(1) },
    },

    // ── Room creation events (parentConversationId absent — these ARE the rooms) ──
    { id: ROOM_CONV_3, title: 'Growth', status: 'active', hasActiveTurn: false, starshipId: DEMO_ID, agents: [], createdAt: daysAgo(3), updatedAt: daysAgo(3) },
    { id: ROOM_CONV_2, title: 'Content', status: 'active', hasActiveTurn: false, starshipId: DEMO_ID, agents: [], createdAt: daysAgo(7), updatedAt: daysAgo(7) },
    { id: ROOM_CONV_1, title: 'Marketing', status: 'active', hasActiveTurn: false, starshipId: DEMO_ID, agents: [], createdAt: daysAgo(14), updatedAt: daysAgo(14) },
  ],
}

// ApprovalsPanel: each room's childrenPendingApprovals
const MOCK_PENDING_SUMMARIES = {
  [ROOM_CONV_1]: {
    roomConvId: ROOM_CONV_1,
    children: [{ id: CHILD_CONV_WITH_APPROVAL, updatedAt: minsAgo(3), pendingCount: 2, agentName: 'Maya' }],
  },
  [ROOM_CONV_2]: { roomConvId: ROOM_CONV_2, children: [] },
  [ROOM_CONV_3]: { roomConvId: ROOM_CONV_3, children: [] },
}

const MOCK_TOOL_APPROVALS = [
  {
    id: 'approval-1',
    conversationId: CHILD_CONV_WITH_APPROVAL,
    agentId: 'agent-1',
    agentName: 'Maya',
    toolSlug: 'send-email',
    toolName: 'Send Email',
    argsJson: { to: 'subscribers@example.com', subject: "Q2 Campaign - You're invited", body: '...(preview text)...' },
    createdAt: minsAgo(3),
    updatedAt: minsAgo(3),
  },
  {
    id: 'approval-2',
    conversationId: CHILD_CONV_WITH_APPROVAL,
    agentId: 'agent-1',
    agentName: 'Maya',
    toolSlug: 'update-crm',
    toolName: 'Update CRM',
    argsJson: { listId: 'trial-users-q2', action: 'tag', tag: 'campaign-q2-2026' },
    createdAt: minsAgo(2),
    updatedAt: minsAgo(2),
  },
]

// Task boards
const MOCK_BOARDS = [
  { id: BOARD_1_ID, name: 'Q2 Launch', starshipId: DEMO_ID, createdAt: daysAgo(20), updatedAt: daysAgo(1) },
  { id: BOARD_2_ID, name: 'Content Pipeline', starshipId: DEMO_ID, createdAt: daysAgo(10), updatedAt: hoursAgo(3) },
]

type MockCard = { id: string; title: string; columnId: string; archived: boolean; createdAt: string }

const MOCK_BOARD_DATA: Record<string, { columns: Record<string, string>; cards: MockCard[]; isLoading: boolean }> = {
  [BOARD_1_ID]: {
    isLoading: false,
    columns: {
      [COL_TODO]: 'To Do',
      [COL_IN_PROGRESS]: 'In Progress',
      [COL_REVIEW]: 'Review',
      [COL_DONE]: 'Done',
    },
    cards: [
      { id: 'c1', title: 'Set up email automation sequences', columnId: COL_DONE, archived: false, createdAt: daysAgo(15) },
      { id: 'c2', title: 'Localise campaign copy for EU market', columnId: COL_DONE, archived: false, createdAt: daysAgo(12) },
      { id: 'c3', title: 'Design landing page A/B variants', columnId: COL_DONE, archived: false, createdAt: daysAgo(10) },
      { id: 'c4', title: 'Integrate Stripe billing for new tier', columnId: COL_IN_PROGRESS, archived: false, createdAt: daysAgo(8) },
      { id: 'c5', title: 'QA all onboarding email triggers', columnId: COL_IN_PROGRESS, archived: false, createdAt: daysAgo(6) },
      { id: 'c6', title: 'Publish launch announcement blog post', columnId: COL_REVIEW, archived: false, createdAt: daysAgo(5) },
      { id: 'c7', title: 'Configure Intercom segment rules', columnId: COL_TODO, archived: false, createdAt: daysAgo(4) },
      { id: 'c8', title: 'Run final pre-launch checklist', columnId: COL_TODO, archived: false, createdAt: daysAgo(3) },
    ],
  },
  [BOARD_2_ID]: {
    isLoading: false,
    columns: {
      [COL_TODO]: 'Backlog',
      [COL_IN_PROGRESS]: 'Writing',
      [COL_REVIEW]: 'Editing',
      [COL_DONE]: 'Published',
    },
    cards: [
      { id: 'd1', title: '"How AI automates email marketing" deep-dive', columnId: COL_DONE, archived: false, createdAt: daysAgo(9) },
      { id: 'd2', title: 'Case study: 3× open-rate improvement story', columnId: COL_IN_PROGRESS, archived: false, createdAt: daysAgo(7) },
      { id: 'd3', title: 'Beginner guide: setting up your first automation', columnId: COL_IN_PROGRESS, archived: false, createdAt: daysAgo(6) },
      { id: 'd4', title: '10 subject line formulas that always convert', columnId: COL_REVIEW, archived: false, createdAt: daysAgo(5) },
      { id: 'd5', title: 'Podcast episode outline — founder interview', columnId: COL_TODO, archived: false, createdAt: daysAgo(4) },
      { id: 'd6', title: 'Twitter thread: AI + copywriting best practices', columnId: COL_TODO, archived: false, createdAt: daysAgo(3) },
      { id: 'd7', title: 'Video script: product walkthrough for YouTube', columnId: COL_TODO, archived: false, createdAt: daysAgo(2) },
    ],
  },
}

// ─── Seed Query Client ────────────────────────────────────────────────────────

function buildPreviewQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: false,
      },
    },
  })

  // Conversations
  client.setQueryData(['conversations', 'starship', DEMO_ID], MOCK_CONVERSATIONS)

  // Rooms
  client.setQueryData(['rooms', 'starship', DEMO_ID], MOCK_ROOMS)

  // Children pending approvals per room
  for (const [roomConvId, summary] of Object.entries(MOCK_PENDING_SUMMARIES)) {
    client.setQueryData(['conversations', 'detail', roomConvId, 'children', 'pending-approvals'], summary)
  }

  // Tool approvals for the child conversation
  client.setQueryData(['conversations', 'detail', CHILD_CONV_WITH_APPROVAL, 'tool-approvals', 'pending'], MOCK_TOOL_APPROVALS)

  // Task boards list
  client.setQueryData(['task-boards', DEMO_ID], MOCK_BOARDS)

  // Task board full data
  for (const [boardId, data] of Object.entries(MOCK_BOARD_DATA)) {
    client.setQueryData(['task-board-full', DEMO_ID, boardId], data)
  }

  return client
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPreviewPage(): React.JSX.Element {
  if (process.env.NODE_ENV === 'production') notFound()

  const [queryClient] = useState(() => buildPreviewQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative flex flex-col h-full min-w-0 bg-background">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur-sm">
          <div className="px-4 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex-shrink-0 md:hidden">
                <MobileNavToggleButton className="mx-1" />
              </span>
              <Icon name="dashboard" weight="bold" className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <h3 className="text-sm font-semibold text-foreground">Dashboard</h3>
              <span className="text-[10px] font-medium text-muted-foreground/40 ml-1 bg-muted/60 rounded px-1.5 py-0.5">preview</span>
            </div>
          </div>
        </div>

        {/* Desktop: main + two-panel aside */}
        <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
          <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
            <AgentActivityColumn starshipId={DEMO_ID} />
          </main>

          <aside className="w-[360px] shrink-0 flex flex-col overflow-hidden">
            <div className="flex-shrink-0 max-h-[45%] flex flex-col overflow-hidden">
              <ApprovalsPanel starshipId={DEMO_ID} />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col pt-4">
              <GoalsColumn starshipId={DEMO_ID} />
            </div>
          </aside>
        </div>

        {/* Mobile: stacked sections */}
        <div className="md:hidden flex-1">
          <div className="min-h-[420px]">
            <AgentActivityColumn starshipId={DEMO_ID} />
          </div>
          <div className="min-h-[280px]">
            <ApprovalsPanel starshipId={DEMO_ID} />
          </div>
          <div className="min-h-[420px]">
            <GoalsColumn starshipId={DEMO_ID} />
          </div>
        </div>
      </div>
    </QueryClientProvider>
  )
}
