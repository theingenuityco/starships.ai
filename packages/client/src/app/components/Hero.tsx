'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import { getHeadlineVariant } from '@/lib/flags'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { useRouter } from 'next/navigation'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import AgentAvatar from '@/components/animated/AgentAvatar'

type DemoStreamChunk = { content: string; position: number; timestamp: number }
type DemoMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  createdAt: string
  updatedAt: string
  messageType: 'user_input' | 'agent_response' | 'tool_result'
  agentName?: string
  streaming?: boolean
  chunks?: DemoStreamChunk[]
  toolCalls?: any[]
  toolCallId?: string
}

function chunkTextForStreaming(text: string) {
  // Split into whitespace-aware tokens so we preserve spacing/newlines, then group into small chunks.
  const tokens = String(text).split(/(\s+)/).filter(t => t.length > 0)
  const parts: string[] = []
  let buf = ''
  for (const t of tokens) {
    buf += t
    if (buf.length >= 16 || t.includes('\n')) {
      parts.push(buf)
      buf = ''
    }
  }
  if (buf) parts.push(buf)
  return parts.length > 0 ? parts : [text]
}

type DemoConvoId = 'main' | 'gaia' | 'daedalus'

const DEMO_CONVERSATIONS: Record<
  DemoConvoId,
  {
    id: DemoConvoId
    label: string
    leftAgentName: string
    leftAgentSeed: string
    rightUserLabel: string
    rightUserSeed?: string
    // When true, the "user" messages in this convo represent a named agent (e.g. Aria)
    userIsAgent: boolean
  }
> = {
  main: { id: 'main', label: 'Aria ↔ You', leftAgentName: 'Aria', leftAgentSeed: 'Aria', rightUserLabel: 'You', rightUserSeed: 'You', userIsAgent: false },
  gaia: { id: 'gaia', label: 'Aria ↔ Gaia', leftAgentName: 'Gaia', leftAgentSeed: 'Gaia', rightUserLabel: 'Aria', rightUserSeed: 'Aria', userIsAgent: true },
  daedalus: { id: 'daedalus', label: 'Aria ↔ Daedalus', leftAgentName: 'Daedalus', leftAgentSeed: 'Daedalus', rightUserLabel: 'Aria', rightUserSeed: 'Aria', userIsAgent: true },
}

type DemoStep = {
  convoId: DemoConvoId
  role: 'user' | 'assistant' | 'tool'
  content: string
  agentName?: string
  messageType?: DemoMessage['messageType']
  toolCalls?: any[]
  toolCallId?: string
  /**
   * When true, skip text streaming (useful for tool results).
   */
  noStream?: boolean
}

// Orchestrated multi-chat demo: Aria delegates to Gaia (agent creation) and Daedalus (tool creation),
// switching the visible conversation as work happens.
const DEMO_TIMELINE: DemoStep[] = [
  {
    convoId: 'main',
    role: 'user',
    content: 'Aria — can you set up a Weekly Ship Update that posts our GitHub changelog to Discord every Friday?',
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    // Delegation is also a tool call in Starships: show the handoff explicitly.
    toolCalls: [
      {
        id: 'tc_demo_delegate_gaia',
        type: 'function',
        function: {
          name: 'call-agent',
          arguments: '{ "agent": "Gaia", "task": "Create the Weekly Ship Update agent (voice + rules)", "conversationTitle": "Weekly Ship Update — Agent" }',
        },
      },
    ],
    noStream: false,
    content:
      "Absolutely. First I’ll call **Gaia** to define the agent (voice + rules).\n\nCreating the child chat now…",
  },
  {
    convoId: 'main',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_delegate_gaia',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        delegatedTo: 'Gaia',
        conversation: { id: 'c_demo_gaia', route: '/ship/uuu/conversations/c_demo_gaia' },
      },
      null,
      2
    ),
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    noStream: true,
    content: 'Switching to Gaia…',
  },
  {
    convoId: 'gaia',
    role: 'user',
    content: 'Create the “Weekly Ship Update” agent. Tone: clear, customer-friendly. Keep it to 5 bullets.',
  },
  {
    convoId: 'gaia',
    role: 'assistant',
    agentName: 'Gaia',
    content:
      "Agent spec:\n\n- **Goal**: turn weekly GitHub activity into a reader-friendly update\n- **Voice**: upbeat, concise, non-technical when possible\n- **Rules**:\n  - prefer outcomes over implementation details\n  - include at most 5 bullets\n  - never leak secrets/stack traces\n  - ask for approval before posting",
  },
  {
    convoId: 'gaia',
    role: 'assistant',
    agentName: 'Gaia',
    toolCalls: [
      {
        id: 'tc_demo_open_agent',
        type: 'function',
        function: {
          name: 'open-agent',
          // Intentionally omit slug to represent "create new agent" in the builder.
          arguments: '{ "slug": null }',
        },
      },
    ],
    noStream: true,
    content: 'Opening the agent builder…',
  },
  {
    convoId: 'gaia',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_open_agent',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        action: 'open-agent',
        route: '/ship/uuu/agent/new?conversationId=c_demo_gaia',
      },
      null,
      2
    ),
  },
  {
    convoId: 'gaia',
    role: 'assistant',
    agentName: 'Gaia',
    content:
      "✅ Created agent: **Weekly Ship Update**\n\n- Default voice: customer-friendly\n- Output format: 5 bullets\n- Guardrails: approval required before posting\n\nReturning to Aria.",
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    toolCalls: [
      {
        id: 'tc_demo_delegate_daedalus',
        type: 'function',
        function: {
          name: 'call-agent',
          arguments: '{ "agent": "Daedalus", "task": "Create the Weekly Ship Update tool (GitHub → summarize → Discord + schedule)", "conversationTitle": "Weekly Ship Update — Tool" }',
        },
      },
    ],
    noStream: false,
    content: "Great — the agent is ready. Now I’m calling **Daedalus** to build the tool and wiring.",
  },
  {
    convoId: 'main',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_delegate_daedalus',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        delegatedTo: 'Daedalus',
        conversation: { id: 'c_demo_daedalus', route: '/ship/uuu/conversations/c_demo_daedalus' },
      },
      null,
      2
    ),
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    noStream: true,
    content: 'Switching to Daedalus…',
  },
  {
    convoId: 'daedalus',
    role: 'user',
    content: 'Build the tool flow: fetch GitHub PRs/issues since last Friday → summarize → post to Discord #announcements.',
  },
  {
    convoId: 'daedalus',
    role: 'assistant',
    agentName: 'Daedalus',
    content:
      "Specs (so we build the right tool):\n\n- **Name**: Weekly Ship Update\n- **Inputs**: `repo`, `discordChannel`, `since` (default: last Friday)\n- **Output**: a 5‑bullet changelog draft (customer‑friendly)\n- **Rules**: dedupe PRs/issues, highlight **features + fixes**, keep links minimal, require approval before posting\n\nI’ll open the tool builder and wire the flow now.",
  },
  {
    convoId: 'daedalus',
    role: 'assistant',
    agentName: 'Daedalus',
    // Show tool calls panel (mocked) like the real app
    toolCalls: [
      { id: 'tc_demo_list_connectors', type: 'function', function: { name: 'list-connectors', arguments: '{}' } },
      { id: 'tc_demo_open_tool', type: 'function', function: { name: 'open-tool', arguments: '{ "slug": null }' } },
      {
        id: 'tc_demo_github_changes',
        type: 'function',
        function: { name: 'github.fetch_weekly_changes', arguments: '{ "repo": "theingenuityco/starships.ai", "since": "last_friday" }' },
      },
      {
        id: 'tc_demo_summarize_changelog',
        type: 'function',
        function: { name: 'summarize.weekly_changelog', arguments: '{ "maxBullets": 5, "tone": "customer_friendly" }' },
      },
      {
        id: 'tc_demo_discord_draft',
        type: 'function',
        function: { name: 'discord.post_draft', arguments: '{ "channel": "#announcements" }' },
      },
    ],
    content: 'Running tool steps…',
  },
  {
    convoId: 'daedalus',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_list_connectors',
    noStream: true,
    content: JSON.stringify(
      {
        connector: 'list-connectors',
        status: 'ok',
        connected: ['github', 'discord'],
      },
      null,
      2
    ),
  },
  {
    convoId: 'daedalus',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_open_tool',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        action: 'open-tool',
        route: '/ship/uuu/tool/new?conversationId=c_demo_daedalus',
      },
      null,
      2
    ),
  },
  {
    convoId: 'daedalus',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_github_changes',
    noStream: true,
    content: JSON.stringify(
      {
        repo: 'theingenuityco/starships.ai',
        mergedPRs: 14,
        closedIssues: 7,
        highlights: ['Faster streaming UI', 'Improved connector runtime', 'Landing refresh'],
      },
      null,
      2
    ),
  },
  {
    convoId: 'daedalus',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_summarize_changelog',
    noStream: true,
    content: JSON.stringify(
      {
        bullets: [
          'Faster streaming + cleaner response states',
          'Improved connector runtime + auth handling',
          'Landing refresh + updated demo experience',
          'Stability fixes and performance improvements',
          'More shipping next week — stay tuned',
        ],
      },
      null,
      2
    ),
  },
  {
    convoId: 'daedalus',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_discord_draft',
    noStream: true,
    content: JSON.stringify(
      {
        channel: '#announcements',
        status: 'draft_ready',
        preview: [
          'Shipped faster streaming + cleaner loaders',
          'Improved connector runtime + auth handling',
          'Landing refresh + updated demo',
          'Bug fixes and stability improvements',
          'More coming next week — stay tuned',
        ],
      },
      null,
      2
    ),
  },
  {
    convoId: 'daedalus',
    role: 'assistant',
    agentName: 'Daedalus',
    content:
      "✅ Created tool: **Weekly Ship Update**\n\nInputs:\n- repo: `theingenuityco/starships.ai`\n- discordChannel: `#announcements`\n- since: last Friday\n\nReady to deploy + schedule.",
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    content:
      "Completed.\n\n- **Agent**: Weekly Ship Update (Gaia)\n- **Tool**: GitHub → summarize → Discord (Daedalus)\n- **Connectors**: GitHub + Discord\n\nTwo quick choices before I deploy:\n1) Highlight **features**, **fixes**, or **both**?\n2) Keep **approve-before-posting** on?",
  },
  {
    convoId: 'main',
    role: 'user',
    content: 'Both. And yes—keep approval on.',
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    toolCalls: [
      {
        id: 'tc_demo_schedule_agent',
        type: 'function',
        function: {
          name: 'schedule-agent',
          arguments:
            '{ "agent": "Weekly Ship Update", "schedule": { "cron": "0 9 * * FRI", "timezone": "UTC" }, "approvalRequired": true, "highlights": ["features","fixes"], "destination": { "connector": "discord", "channel": "#announcements" } }',
        },
      },
    ],
    noStream: false,
    content:
      'Perfect — scheduling it now…',
  },
  {
    convoId: 'main',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_schedule_agent',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        action: 'schedule-agent',
        schedule: { cron: '0 9 * * FRI', timezone: 'UTC' },
        approvalRequired: true,
        destination: { connector: 'discord', channel: '#announcements' },
      },
      null,
      2
    ),
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    noStream: true,
    content:
      "✅ Scheduled **every Friday**\n✅ Posts **features + fixes** to **#announcements**\n✅ **Approval required** before publishing\n\nNext step: connect GitHub + Discord, then click **Deploy**.",
  },
]

export default function Hero() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { data: starships = [] } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)
  const primaryStarship = starships[0]
  const [heroLogoTrigger, setHeroLogoTrigger] = useState(0)
  const [isPrimaryAnimating, setIsPrimaryAnimating] = useState(false)
  const pendingPrimaryActionRef = useRef<null | (() => void)>(null)
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeDemoConvoId, setActiveDemoConvoId] = useState<DemoConvoId>('main')
  const [demoByConvo, setDemoByConvo] = useState<Record<DemoConvoId, DemoMessage[]>>({ main: [], gaia: [], daedalus: [] })
  const [respondingByConvo, setRespondingByConvo] = useState<Record<DemoConvoId, boolean>>({ main: false, gaia: false, daedalus: false })
  const [awaitingToolsByConvo, setAwaitingToolsByConvo] = useState<Record<DemoConvoId, boolean>>({ main: false, gaia: false, daedalus: false })

  useEffect(() => {
    return () => {
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
    }
  }, [])

  // Mock streaming effect for the landing conversation demo (multi-chat with switching).
  useEffect(() => {
    let cancelled = false
    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
    const setResponding = (convoId: DemoConvoId, value: boolean) => {
      setRespondingByConvo(prev => (prev[convoId] === value ? prev : { ...prev, [convoId]: value }))
    }
    const appendMessage = (convoId: DemoConvoId, msg: DemoMessage) => {
      setDemoByConvo(prev => ({ ...prev, [convoId]: [...(prev[convoId] || []), msg] }))
    }
    const updateMessage = (convoId: DemoConvoId, id: string, patch: Partial<DemoMessage>) => {
      setDemoByConvo(prev => ({
        ...prev,
        [convoId]: (prev[convoId] || []).map(m => (m.id === id ? ({ ...m, ...patch } as any) : m)),
      }))
    }

    const run = async () => {
      // Loop forever (until unmount) so the demo stays "alive".
      while (!cancelled) {
        setRespondingByConvo({ main: false, gaia: false, daedalus: false })
        setAwaitingToolsByConvo({ main: false, gaia: false, daedalus: false })
        setDemoByConvo({ main: [], gaia: [], daedalus: [] })
        setActiveDemoConvoId('main')
        // IMPORTANT: Do not rely on React state for switching decisions inside this async loop
        // (it will be stale inside the closure). Track the active convo locally.
        let activeConvo: DemoConvoId = 'main'
        await sleep(350)

        let now = Date.now()
        const seqByConvo: Record<DemoConvoId, number> = { main: 0, gaia: 0, daedalus: 0 }
        const lastToolRunnerId: Record<DemoConvoId, string | null> = { main: null, gaia: null, daedalus: null }
        const pendingToolIds: Record<DemoConvoId, Set<string>> = { main: new Set(), gaia: new Set(), daedalus: new Set() }

        for (const step of DEMO_TIMELINE) {
          if (cancelled) return

          // Switch visible conversation when the step targets a different one.
          if (step.convoId !== activeConvo) {
            activeConvo = step.convoId
            setActiveDemoConvoId(activeConvo)
            await sleep(420)
          }

          const createdAt = new Date(now).toISOString()
          now += 900

          if (step.role === 'user') {
            seqByConvo[step.convoId] += 1
            const id = `demo-${step.convoId}-u${seqByConvo[step.convoId]}-${now}`
            const msg: DemoMessage = {
              id,
              role: 'user',
              content: step.content,
              createdAt,
              updatedAt: createdAt,
              messageType: 'user_input',
            }
            appendMessage(step.convoId, msg)
            await sleep(700)
            continue
          }

          // Tool results: append as-is, and keep "awaiting tools" active until all results arrive.
          if (step.messageType === 'tool_result' || step.role === 'tool') {
            seqByConvo[step.convoId] += 1
            const id = `demo-${step.convoId}-tr${seqByConvo[step.convoId]}-${now}`
            const msg: DemoMessage = {
              id,
              role: step.role,
              content: step.content,
              createdAt,
              updatedAt: createdAt,
              messageType: 'tool_result',
              toolCallId: step.toolCallId,
            }
            appendMessage(step.convoId, msg)
            // If this conversation had a tool runner streaming, stop it once results start coming in.
            const runnerId = lastToolRunnerId[step.convoId]
            if (runnerId) {
              updateMessage(step.convoId, runnerId, { streaming: false })
            }
            if (step.toolCallId) {
              pendingToolIds[step.convoId].delete(step.toolCallId)
            }
            const stillPending = pendingToolIds[step.convoId].size > 0
            setAwaitingToolsByConvo(prev => ({ ...prev, [step.convoId]: stillPending }))
            await sleep(420)
            continue
          }

          seqByConvo[step.convoId] += 1
          const id = `demo-${step.convoId}-a${seqByConvo[step.convoId]}-${now}`
          const msg: DemoMessage = {
            id,
            role: 'assistant',
            agentName: step.agentName || 'Aria',
            content: '',
            createdAt,
            updatedAt: createdAt,
            messageType: 'agent_response',
            streaming: true,
            chunks: [],
            ...(Array.isArray(step.toolCalls) ? ({ toolCalls: step.toolCalls } as any) : {}),
          }
          appendMessage(step.convoId, msg)
          setResponding(step.convoId, true)

          // If this assistant message is a "tool runner", mark tools as in-flight.
          if (Array.isArray(step.toolCalls) && step.toolCalls.length > 0) {
            lastToolRunnerId[step.convoId] = id
            const ids = step.toolCalls.map((tc: any) => tc?.id ?? tc?.call_id ?? tc?.toolCallId ?? tc?.function?.id).filter(Boolean).map((x: any) => String(x))
            pendingToolIds[step.convoId] = new Set(ids)
            setAwaitingToolsByConvo(prev => ({ ...prev, [step.convoId]: ids.length > 0 }))
          }

          if (!step.noStream) {
            const parts = chunkTextForStreaming(step.content)
            let position = 0
            let chunks: DemoStreamChunk[] = []

            for (const part of parts) {
              if (cancelled) return
              chunks = [...chunks, { content: part, position, timestamp: Date.now() }]
              position += 1
              updateMessage(step.convoId, id, { chunks, streaming: true })
              await sleep(45)
            }
          } else {
            // Immediate (non-streaming) assistant text
            updateMessage(step.convoId, id, { content: step.content, streaming: true })
            await sleep(180)
          }

          // Finalize: set full content and stop streaming.
          updateMessage(step.convoId, id, { content: step.content, streaming: false, updatedAt: new Date(Date.now()).toISOString() })
          setResponding(step.convoId, false)
          await sleep(900)
        }

        // Pause before restarting.
        await sleep(2200)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  const runPendingPrimaryAction = useCallback(() => {
    const fn = pendingPrimaryActionRef.current
    if (!fn) return
    pendingPrimaryActionRef.current = null
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current)
      fallbackTimeoutRef.current = null
    }
    fn()
  }, [])

  const navigatePrimary = useCallback(() => {
    if (isAuthenticated && primaryStarship?.slug) {
      router.push(`/ship/${primaryStarship.slug}/conversations`)
      return
    }
    router.push('/login')
  }, [isAuthenticated, primaryStarship?.slug, router])

  const handlePrimaryClick = useCallback(() => {
    if (isPrimaryAnimating) return
    track({ type: 'hero_cta_clicked' })

    setIsPrimaryAnimating(true)
    pendingPrimaryActionRef.current = () => {
      navigatePrimary()
      setIsPrimaryAnimating(false)
    }

    // Kick off the logo entry animation, then navigate once it completes.
    setHeroLogoTrigger(v => v + 1)

    // Fallback: if the animation completion callback doesn't fire (e.g. reduced motion),
    // proceed after a short delay.
    fallbackTimeoutRef.current = setTimeout(() => {
      runPendingPrimaryAction()
    }, 1100)
  }, [isPrimaryAnimating, navigatePrimary, runPendingPrimaryAction])

  return (
    <section className="pt-44 md:pt-52 pb-20 px-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-8 sm:gap-10 items-center text-center">
        <div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-tight mb-4 max-w-[26ch] mx-auto">
            {(() => {
              const v = getHeadlineVariant()
              if (v === 'B') return 'Hire your AI team—then brief them in plain English'
              if (v === 'C') return 'A team of AI specialists that ships work with you'
              return (
                <>
                  Your very own{' '}
                  <span className="warp-word" data-text="ai">
                    <span className="warp-letter">A</span>
                    <span className="warp-letter">I</span>
                  </span>
                  &nbsp;
                  <span className="warp-word" data-text="team">
                    <span className="warp-letter">t</span>
                    <span className="warp-letter">e</span>
                    <span className="warp-letter">a</span>
                    <span className="warp-letter">m</span>
                  </span>
                </>
              )
            })()}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-8 md:mb-12 leading-relaxed max-w-[60ch] mx-auto">Build, manage and deploy agents to handle the busy work.</p>
          <div className="flex flex-col items-center gap-3 justify-center">
            <Button
              size="lg"
              className="h-14 sm:h-16 px-12 sm:px-14 text-lg sm:text-xl leading-none overflow-hidden rounded-full [&_svg]:!w-10 [&_svg]:!h-10 disabled:opacity-100 disabled:bg-primary disabled:text-primary-foreground"
              onClick={handlePrimaryClick}
              disabled={isPrimaryAnimating}
              aria-busy={isPrimaryAnimating}
            >
              <span className="inline-flex w-10 h-10 items-center justify-center mr-1">
                <StarshipsLogo
                  width={40}
                  height={40}
                  className="text-primary-foreground"
                  gradientId="hero-starships-logo-gradient"
                  idleLoop={false}
                  activeStroke="currentColor"
                  triggerAnimation={heroLogoTrigger}
                  onEntryAnimationComplete={runPendingPrimaryAction}
                />
              </span>
              {isAuthenticated ? `Enter ${primaryStarship?.name || 'your starship'}` : 'Get started for free'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-base text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                window.location.href = '/marketplace?from=public'
              }}
            >
              <Icon name="store" className="w-6 h-6 mr-1" />
              Explore agents in Marketplace
            </Button>
          </div>
        </div>

        {/* Conversation demo (uses the same message renderer as /ship/.../conversations) */}
        <div className="relative isolate w-full overflow-visible mt-6 sm:mt-8 md:mt-10 text-left">
          {/* Glow layer around the frame */}
          <div className="absolute inset-0 -z-10 rounded-2xl video-glow opacity-80 pointer-events-none" aria-hidden />
          {/* Blurry, almost transparent border */}
          <div className="absolute inset-0 -z-10 rounded-2xl video-blur-border opacity-90 pointer-events-none" aria-hidden />

          <div className="relative z-10 rounded-2xl shadow-2xl overflow-hidden border border-border/40 bg-card">
            <div
              className="relative w-full"
              style={{
                background:
                  'radial-gradient(1000px 700px at 20% 20%, rgba(245, 158, 11, 0.12) 0%, transparent 58%), radial-gradient(1000px 700px at 80% 80%, rgba(217, 119, 6, 0.08) 0%, transparent 56%)',
              }}
            >
              <div className="h-[520px] sm:h-[580px] md:h-[640px] flex flex-col">
                <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background/10 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center -space-x-2">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border/40">
                            <AgentAvatar seed={DEMO_CONVERSATIONS[activeDemoConvoId].leftAgentSeed} size={32} />
                          </div>
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border/40">
                            <AgentAvatar seed={DEMO_CONVERSATIONS[activeDemoConvoId].rightUserSeed || 'You'} size={32} />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium leading-none truncate">{DEMO_CONVERSATIONS[activeDemoConvoId].label}</div>
                          <div className="text-xs text-muted-foreground truncate">Live demo: switching chats while Aria delegates</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(Object.keys(DEMO_CONVERSATIONS) as DemoConvoId[]).map(id => {
                          const active = id === activeDemoConvoId
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setActiveDemoConvoId(id)}
                              className={[
                                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                                active ? 'bg-primary text-primary-foreground border-primary/40' : 'bg-background/40 text-foreground/80 border-border/50 hover:bg-background/60',
                              ].join(' ')}
                            >
                              {DEMO_CONVERSATIONS[id].label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                  <ConversationMessageList
                    conversationId={null}
                    messagesOverride={(demoByConvo[activeDemoConvoId] || []) as any}
                    agentNameOverride={DEMO_CONVERSATIONS[activeDemoConvoId].leftAgentName}
                    isRespondingOverride={(respondingByConvo[activeDemoConvoId] || false) || (awaitingToolsByConvo[activeDemoConvoId] || false)}
                    isAssistantStreamingOverride={respondingByConvo[activeDemoConvoId] || false}
                    isAwaitingToolResultsOverride={awaitingToolsByConvo[activeDemoConvoId] || false}
                    bottomPaddingPx={24}
                    className="bg-card"
                    scrollClassName="bg-card"
                    userNameOverride={DEMO_CONVERSATIONS[activeDemoConvoId].userIsAgent ? DEMO_CONVERSATIONS[activeDemoConvoId].rightUserLabel : undefined}
                    userAvatarSeedOverride={DEMO_CONVERSATIONS[activeDemoConvoId].userIsAgent ? DEMO_CONVERSATIONS[activeDemoConvoId].rightUserSeed : undefined}
                  />
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/50 to-transparent" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .warp-word {
          display: inline-flex;
          gap: 0;
          position: relative;
        }

        .warp-letter {
          display: inline-block;
          animation:
            warp-letter-in 640ms cubic-bezier(0.22, 1, 0.36, 1) both,
            gradient-shift 8s ease-in-out 1.2s infinite,
            warp-blur 3.6s ease-in-out 1.3s infinite;
          will-change: transform, opacity, filter, background-position;
          background: linear-gradient(120deg, rgba(168, 85, 247, 0.95) 0%, rgba(139, 92, 246, 0.9) 35%, rgba(124, 58, 237, 0.9) 70%, rgba(168, 85, 247, 0.95) 100%);
          background-size: 250% 250%;
          color: transparent;
          -webkit-text-fill-color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
        }

        .warp-letter:nth-child(1) {
          animation-delay: 0ms;
        }
        .warp-letter:nth-child(2) {
          animation-delay: 60ms;
        }
        .warp-letter:nth-child(3) {
          animation-delay: 120ms;
        }
        .warp-letter:nth-child(4) {
          animation-delay: 180ms;
        }

        @keyframes warp-letter-in {
          0% {
            opacity: 0;
            transform: translateY(14px) scaleX(1.5) skewX(-14deg);
            filter: blur(8px);
            text-shadow:
              10px 0 rgba(168, 85, 247, 0.28),
              -10px 0 rgba(139, 92, 246, 0.22),
              18px 0 rgba(124, 58, 237, 0.14),
              -18px 0 rgba(168, 85, 247, 0.12);
          }
          45% {
            opacity: 1;
            transform: translateY(0) scaleX(0.94) skewX(3deg);
            filter: blur(1px);
            text-shadow:
              6px 0 rgba(168, 85, 247, 0.18),
              -6px 0 rgba(139, 92, 246, 0.14);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scaleX(1) skewX(0deg);
            filter: blur(0);
            text-shadow: none;
          }
        }

        /* Remove pseudo-element overlays to prevent background bleed */

        @keyframes gradient-shift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        /* Subtle pulsating blur inside the glyphs */
        @keyframes warp-blur {
          0%,
          100% {
            filter: blur(0);
          }
          45% {
            filter: blur(1.6px);
          }
          50% {
            filter: blur(3px);
          }
          55% {
            filter: blur(1.6px);
          }
        }

        /* No outer glow – keep all effects inside glyphs */

        @media (prefers-reduced-motion: reduce) {
          .warp-letter {
            animation: none;
          }
          .warp-word {
          }
        }

        /* Glow styles moved to global CSS for earlier paint */
      `}</style>
    </section>
  )
}
