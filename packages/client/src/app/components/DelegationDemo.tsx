'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'

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
  daedalus: {
    id: 'daedalus',
    label: 'Aria ↔ Daedalus',
    leftAgentName: 'Daedalus',
    leftAgentSeed: 'Daedalus',
    rightUserLabel: 'Aria',
    rightUserSeed: 'Aria',
    userIsAgent: true,
  },
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
    content: "Absolutely. First I’ll call **Gaia** to define the agent (voice + rules).\n\nCreating the child chat now…",
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
  { convoId: 'main', role: 'assistant', agentName: 'Aria', noStream: true, content: 'Switching to Gaia…' },
  { convoId: 'gaia', role: 'user', content: 'Create the “Weekly Ship Update” agent. Tone: clear, customer-friendly. Keep it to 5 bullets.' },
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
  { convoId: 'main', role: 'assistant', agentName: 'Aria', noStream: true, content: 'Switching to Daedalus…' },
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
      { id: 'tc_demo_github_changes', type: 'function', function: { name: 'github.fetch_weekly_changes', arguments: '{ "repo": "theingenuityco/starships.ai", "since": "last_friday" }' } },
      { id: 'tc_demo_summarize_changelog', type: 'function', function: { name: 'summarize.weekly_changelog', arguments: '{ "maxBullets": 5, "tone": "customer_friendly" }' } },
      { id: 'tc_demo_discord_draft', type: 'function', function: { name: 'discord.post_draft', arguments: '{ "channel": "#announcements" }' } },
    ],
    content: 'Running tool steps…',
  },
  {
    convoId: 'daedalus',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_list_connectors',
    noStream: true,
    content: JSON.stringify({ connector: 'list-connectors', status: 'ok', connected: ['github', 'discord'] }, null, 2),
  },
  {
    convoId: 'daedalus',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_open_tool',
    noStream: true,
    content: JSON.stringify({ status: 'ok', action: 'open-tool', route: '/ship/uuu/tool/new?conversationId=c_demo_daedalus' }, null, 2),
  },
  {
    convoId: 'daedalus',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_github_changes',
    noStream: true,
    content: JSON.stringify({ repo: 'theingenuityco/starships.ai', mergedPRs: 14, closedIssues: 7, highlights: ['Faster streaming UI', 'Improved connector runtime', 'Landing refresh'] }, null, 2),
  },
  {
    convoId: 'daedalus',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_summarize_changelog',
    noStream: true,
    content: JSON.stringify(
      { bullets: ['Faster streaming + cleaner response states', 'Improved connector runtime + auth handling', 'Landing refresh + updated demo experience', 'Stability fixes and performance improvements', 'More shipping next week — stay tuned'] },
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
  { convoId: 'main', role: 'user', content: 'Both. And yes—keep approval on.' },
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
    content: 'Perfect — scheduling it now…',
  },
  {
    convoId: 'main',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_schedule_agent',
    noStream: true,
    content: JSON.stringify(
      { status: 'ok', action: 'schedule-agent', schedule: { cron: '0 9 * * FRI', timezone: 'UTC' }, approvalRequired: true, destination: { connector: 'discord', channel: '#announcements' } },
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

export default function DelegationDemo() {
  const [activeDemoConvoId, setActiveDemoConvoId] = useState<DemoConvoId>('main')
  const [demoByConvo, setDemoByConvo] = useState<Record<DemoConvoId, DemoMessage[]>>({ main: [], gaia: [], daedalus: [] })
  const [respondingByConvo, setRespondingByConvo] = useState<Record<DemoConvoId, boolean>>({ main: false, gaia: false, daedalus: false })
  const [awaitingToolsByConvo, setAwaitingToolsByConvo] = useState<Record<DemoConvoId, boolean>>({ main: false, gaia: false, daedalus: false })

  const containerRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightTopRef = useRef<HTMLDivElement>(null)
  const rightBottomRef = useRef<HTMLDivElement>(null)

  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [paths, setPaths] = useState<{ toGaia: string; toDaedalus: string }>({ toGaia: '', toDaedalus: '' })

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
            const ids = step.toolCalls
              .map((tc: any) => tc?.id ?? tc?.call_id ?? tc?.toolCallId ?? tc?.function?.id)
              .filter(Boolean)
              .map((x: any) => String(x))
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
              await sleep(70)
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

  useEffect(() => {
    const container = containerRef.current
    const left = leftRef.current
    const top = rightTopRef.current
    const bottom = rightBottomRef.current
    if (!container || !left || !top || !bottom) return

    const makePath = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const dx = Math.max(80, Math.min(220, (to.x - from.x) * 0.55))
      return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
    }

    const compute = () => {
      const c = container.getBoundingClientRect()
      const l = left.getBoundingClientRect()
      const t = top.getBoundingClientRect()
      const b = bottom.getBoundingClientRect()

      const w = Math.max(0, Math.round(c.width))
      const h = Math.max(0, Math.round(c.height))

      const from = {
        x: l.right - c.left,
        y: l.top - c.top + l.height * 0.5,
      }
      const toGaia = {
        x: t.left - c.left,
        y: t.top - c.top + t.height * 0.5,
      }
      const toDaedalus = {
        x: b.left - c.left,
        y: b.top - c.top + b.height * 0.5,
      }

      setSvgSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }))
      setPaths(prev => {
        const next = { toGaia: makePath(from, toGaia), toDaedalus: makePath(from, toDaedalus) }
        return prev.toGaia === next.toGaia && prev.toDaedalus === next.toDaedalus ? prev : next
      })
    }

    const rafCompute = () => requestAnimationFrame(compute)
    rafCompute()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(rafCompute) : null
    ro?.observe(container)
    ro?.observe(left)
    ro?.observe(top)
    ro?.observe(bottom)

    window.addEventListener('resize', rafCompute, { passive: true } as any)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', rafCompute as any)
    }
  }, [demoByConvo, respondingByConvo, awaitingToolsByConvo])

  const isGaiaActive = activeDemoConvoId === 'gaia'
  const isDaedalusActive = activeDemoConvoId === 'daedalus'

  return (
    <div ref={containerRef} className="relative isolate w-full overflow-visible text-left">
      {/* Connector paths (desktop only; mobile stacks windows) */}
      <svg
        className="hidden md:block absolute inset-0 pointer-events-none"
        width={svgSize.w}
        height={svgSize.h}
        viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {paths.toGaia ? <path d={paths.toGaia} className={['delegation-edge', isGaiaActive ? 'delegation-edge--active' : ''].join(' ')} /> : null}
        {paths.toDaedalus ? <path d={paths.toDaedalus} className={['delegation-edge', isDaedalusActive ? 'delegation-edge--active' : ''].join(' ')} /> : null}
      </svg>

      <div className="relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-20 lg:gap-24 xl:gap-28">
          {/* Left: Aria main chat */}
          <div ref={leftRef} className="md:w-[48%]">
            <div className="relative isolate overflow-visible">
              {/* Glow per-window (only when active) */}
              <div
                className={[
                  'absolute inset-0 -z-10 rounded-2xl delegation-active-glow pointer-events-none transition-opacity duration-500',
                  activeDemoConvoId === 'main' ? 'opacity-70' : 'opacity-0',
                ].join(' ')}
                aria-hidden
              />
              <div
                className={[
                  'absolute inset-0 -z-10 rounded-2xl delegation-active-border pointer-events-none transition-opacity duration-500',
                  activeDemoConvoId === 'main' ? 'opacity-55' : 'opacity-0',
                ].join(' ')}
                aria-hidden
              />

              <div
                className={[
                  'relative z-10 rounded-2xl overflow-hidden border bg-background shadow-lg shadow-black/20',
                  activeDemoConvoId === 'main' ? 'border-amber-400/35' : 'border-border/40',
                ].join(' ')}
              >
                <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-none truncate">{DEMO_CONVERSATIONS.main.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground truncate">Delegator conversation</div>
                    </div>
                    {activeDemoConvoId === 'main' ? (
                      <div className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/30 text-amber-300 bg-amber-500/10">active</div>
                    ) : null}
                  </div>
                </div>
                <div className="h-[480px] sm:h-[540px] md:h-[600px] flex flex-col">
                  <div className="flex-1 overflow-hidden">
                    <ConversationMessageList
                      conversationId={null}
                      messagesOverride={(demoByConvo.main || []) as any}
                      agentNameOverride={DEMO_CONVERSATIONS.main.leftAgentName}
                      isRespondingOverride={(respondingByConvo.main || false) || (awaitingToolsByConvo.main || false)}
                      isAssistantStreamingOverride={respondingByConvo.main || false}
                      isAwaitingToolResultsOverride={awaitingToolsByConvo.main || false}
                      bottomPaddingPx={140}
                      userNameOverride="You"
                      userAvatarSeedOverride="You"
                    />
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/50 to-transparent" aria-hidden />
                </div>
              </div>
            </div>
          </div>

          {/* Right: two delegated chats */}
          <div className="md:w-[52%] flex flex-col gap-8 md:gap-10">
            {/* Top: Gaia */}
            <div ref={rightTopRef}>
              <div className="relative isolate overflow-visible">
                {/* Glow per-window (only when active) */}
                <div
                  className={[
                    'absolute inset-0 -z-10 rounded-2xl delegation-active-glow pointer-events-none transition-opacity duration-500',
                    activeDemoConvoId === 'gaia' ? 'opacity-70' : 'opacity-0',
                  ].join(' ')}
                  aria-hidden
                />
                <div
                  className={[
                    'absolute inset-0 -z-10 rounded-2xl delegation-active-border pointer-events-none transition-opacity duration-500',
                    activeDemoConvoId === 'gaia' ? 'opacity-55' : 'opacity-0',
                  ].join(' ')}
                  aria-hidden
                />

                <div
                  className={[
                    'relative z-10 rounded-2xl overflow-hidden border bg-background shadow-lg shadow-black/20',
                    activeDemoConvoId === 'gaia' ? 'border-amber-400/35' : 'border-border/40',
                  ].join(' ')}
                >
                  <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-none truncate">{DEMO_CONVERSATIONS.gaia.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground truncate">Agent creation</div>
                      </div>
                      {activeDemoConvoId === 'gaia' ? (
                        <div className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/30 text-amber-300 bg-amber-500/10">active</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="h-[360px] md:h-[305px] flex flex-col">
                    <div className="flex-1 overflow-hidden">
                      <ConversationMessageList
                        conversationId={null}
                        messagesOverride={(demoByConvo.gaia || []) as any}
                        agentNameOverride={DEMO_CONVERSATIONS.gaia.leftAgentName}
                        isRespondingOverride={(respondingByConvo.gaia || false) || (awaitingToolsByConvo.gaia || false)}
                        isAssistantStreamingOverride={respondingByConvo.gaia || false}
                        isAwaitingToolResultsOverride={awaitingToolsByConvo.gaia || false}
                        bottomPaddingPx={90}
                        userNameOverride={DEMO_CONVERSATIONS.gaia.rightUserLabel}
                        userAvatarSeedOverride={DEMO_CONVERSATIONS.gaia.rightUserSeed}
                      />
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background/50 to-transparent" aria-hidden />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom: Daedalus */}
            <div ref={rightBottomRef}>
              <div className="relative isolate overflow-visible">
                {/* Glow per-window (only when active) */}
                <div
                  className={[
                    'absolute inset-0 -z-10 rounded-2xl delegation-active-glow pointer-events-none transition-opacity duration-500',
                    activeDemoConvoId === 'daedalus' ? 'opacity-70' : 'opacity-0',
                  ].join(' ')}
                  aria-hidden
                />
                <div
                  className={[
                    'absolute inset-0 -z-10 rounded-2xl delegation-active-border pointer-events-none transition-opacity duration-500',
                    activeDemoConvoId === 'daedalus' ? 'opacity-55' : 'opacity-0',
                  ].join(' ')}
                  aria-hidden
                />

                <div
                  className={[
                    'relative z-10 rounded-2xl overflow-hidden border bg-background shadow-lg shadow-black/20',
                    activeDemoConvoId === 'daedalus' ? 'border-amber-400/35' : 'border-border/40',
                  ].join(' ')}
                >
                  <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-none truncate">{DEMO_CONVERSATIONS.daedalus.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground truncate">Tool creation</div>
                      </div>
                      {activeDemoConvoId === 'daedalus' ? (
                        <div className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/30 text-amber-300 bg-amber-500/10">active</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="h-[360px] md:h-[305px] flex flex-col">
                    <div className="flex-1 overflow-hidden">
                      <ConversationMessageList
                        conversationId={null}
                        messagesOverride={(demoByConvo.daedalus || []) as any}
                        agentNameOverride={DEMO_CONVERSATIONS.daedalus.leftAgentName}
                        isRespondingOverride={(respondingByConvo.daedalus || false) || (awaitingToolsByConvo.daedalus || false)}
                        isAssistantStreamingOverride={respondingByConvo.daedalus || false}
                        isAwaitingToolResultsOverride={awaitingToolsByConvo.daedalus || false}
                        bottomPaddingPx={90}
                        userNameOverride={DEMO_CONVERSATIONS.daedalus.rightUserLabel}
                        userAvatarSeedOverride={DEMO_CONVERSATIONS.daedalus.rightUserSeed}
                      />
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background/50 to-transparent" aria-hidden />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .delegation-active-glow::before {
          content: '';
          position: absolute;
          inset: -14px;
          border-radius: inherit;
          /* Match the landing "video-glow" multicolor pattern, but tighter so it doesn't bleed into neighbors. */
          background: conic-gradient(
            from 0deg at 50% 50%,
            rgba(99, 102, 241, 0.85),
            rgba(217, 70, 239, 0.85),
            rgba(245, 158, 11, 0.75),
            rgba(99, 102, 241, 0.85)
          );
          filter: blur(32px);
          opacity: 1;
          pointer-events: none;
        }

        .delegation-active-border::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 3px solid rgba(255, 255, 255, 0.30);
          filter: blur(8px);
          opacity: 1;
          pointer-events: none;
        }

        .delegation-edge {
          fill: none;
          stroke: rgba(245, 158, 11, 0.28);
          stroke-width: 2.2px;
          stroke-linecap: round;
        }
        .delegation-edge--active {
          stroke: rgba(245, 158, 11, 0.85);
          stroke-width: 2.4px;
          stroke-dasharray: 6 10;
          animation: delegationEdgeDash 1.8s linear infinite;
        }
        @keyframes delegationEdgeDash {
          to {
            stroke-dashoffset: -32;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .delegation-edge,
          .delegation-edge--active {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}


