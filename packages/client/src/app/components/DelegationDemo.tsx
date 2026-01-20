'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { useAgentTemplates } from '@/hooks/useTemplates'

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

function createAbortableSleep(signal: AbortSignal) {
  const timeouts = new Set<ReturnType<typeof setTimeout>>()

  const sleep = (ms: number) =>
    new Promise<void>(resolve => {
      if (signal.aborted) return resolve()
      let id: ReturnType<typeof setTimeout>
      const onAbort = () => {
        clearTimeout(id)
        timeouts.delete(id)
        resolve()
      }
      id = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        timeouts.delete(id)
        resolve()
      }, ms)
      timeouts.add(id)
      signal.addEventListener('abort', onAbort, { once: true })
    })

  const clearAll = () => {
    for (const id of timeouts) clearTimeout(id)
    timeouts.clear()
  }

  return { sleep, clearAll }
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

type DemoConvoId = 'main' | 'dean' | 'clara'

const DEMO_CONVERSATIONS: Record<
  DemoConvoId,
  {
    id: DemoConvoId
    label: string
    leftAgentName: string
    leftAgentSeed: string
    rightUserLabel: string
    rightUserSeed?: string
    designation: string
    // When true, the "user" messages in this convo represent a named agent (e.g. Aria)
    userIsAgent: boolean
  }
> = {
  main: { id: 'main', label: 'You ↔ Aria', leftAgentName: 'Aria', leftAgentSeed: 'Aria', rightUserLabel: 'You', rightUserSeed: 'You', designation: 'Agent Orchestrator', userIsAgent: false },
  dean: {
    id: 'dean',
    label: 'Aria ↔ Dean',
    leftAgentName: 'Dean',
    leftAgentSeed: 'Dean',
    rightUserLabel: 'Aria',
    rightUserSeed: 'Aria',
    designation: 'Google Drive Specialist',
    userIsAgent: true,
  },
  clara: {
    id: 'clara',
    label: 'Aria ↔ Clara',
    leftAgentName: 'Clara',
    leftAgentSeed: 'Clara',
    rightUserLabel: 'Aria',
    rightUserSeed: 'Aria',
    designation: 'Gmail Specialist',
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

// Orchestrated multi-chat demo: Aria delegates to Dean (Google Drive) and Clara (Gmail),
// switching the visible conversation as work happens.
const DEMO_TIMELINE: DemoStep[] = [
  {
    convoId: 'main',
    role: 'user',
    content: "Aria, summarize last week's project briefs from our Google Drive folder and email a summary to the team.",
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    // Delegation is also a tool call in Starships: show the handoff explicitly.
    toolCalls: [
      {
        id: 'tc_demo_delegate_dean',
        type: 'function',
        function: {
          name: 'Switching to Dean…',
          arguments:
            '{ "agent": "Dean", "task": "Pull last week\'s project briefs from our Google Drive folder and summarize them into a one-pager", "conversationTitle": "Drive - Project briefs" }',
        },
      },
    ],
    noStream: false,
    content: "I'll call **Dean** to pull the briefs.",
  },
  {
    convoId: 'main',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_delegate_dean',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        delegatedTo: 'Dean',
        conversation: { id: 'c_demo_dean', route: '/ship/uuu/conversations/c_demo_dean' },
      },
      null,
      2
    ),
  },
  {
    convoId: 'dean',
    role: 'user',
    content: "Summarize last week's project briefs from Drive into a one-pager.",
  },
  {
    convoId: 'dean',
    role: 'assistant',
    agentName: 'Dean',
    content: "Listing last week's briefs and summarizing into one page.",
  },
  {
    convoId: 'dean',
    role: 'assistant',
    agentName: 'Dean',
    toolCalls: [
      { id: 'tc_demo_list_drive', type: 'function', function: { name: 'Listing files...', arguments: '{ "folderName": "Project Briefs", "modifiedAfter": "last_week" }' } },
    ],
    content: '',
  },
  {
    convoId: 'dean',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_list_drive',
    noStream: true,
    content: JSON.stringify(
      { status: 'ok', files: ['Q1 Brief.pdf', 'Product Roadmap.docx', 'Sprint Summary.docx'], count: 3, summary: ['Quarterly focus', 'Plans for the year', 'Recent work'] },
      null,
      2
    ),
  },
  {
    convoId: 'dean',
    role: 'assistant',
    agentName: 'Dean',
    content: "✅ **Briefs** summarized.",
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    toolCalls: [
      {
        id: 'tc_demo_delegate_clara',
        type: 'function',
        function: {
          name: 'Switching to Clara…',
          arguments:
            '{ "agent": "Clara", "task": "Email the summary to the team via Gmail", "conversationTitle": "Gmail - Team email" }',
        },
      },
    ],
    noStream: false,
    content: "Summary ready. Calling **Clara** to send via Gmail.",
  },
  {
    convoId: 'main',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_delegate_clara',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        delegatedTo: 'Clara',
        conversation: { id: 'c_demo_clara', route: '/ship/uuu/conversations/c_demo_clara' },
      },
      null,
      2
    ),
  },
  {
    convoId: 'clara',
    role: 'user',
    content: 'Email the summary to the team via Gmail.',
  },
  {
    convoId: 'clara',
    role: 'assistant',
    agentName: 'Clara',
    content: "Drafting and sending to the team.",
  },
  {
    convoId: 'clara',
    role: 'assistant',
    agentName: 'Clara',
    toolCalls: [
      { id: 'tc_demo_compose_draft', type: 'function', function: { name: 'Composing email...', arguments: '{ "to": "team@company.com", "subject": "Project Briefs Summary" }' } },
    ],
    content: '',
  },
  {
    convoId: 'clara',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_compose_draft',
    noStream: true,
    content: JSON.stringify({ status: 'ok', draftId: 'draft_abc', messageId: 'msg_xyz', to: ['team@company.com'], subject: 'Project Briefs Summary' }, null, 2),
  },
  {
    convoId: 'clara',
    role: 'assistant',
    agentName: 'Clara',
    content: "✅ Emails sent.\n\n- **To**: team@company.com\n- **Subject**: Project Briefs Summary",
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    content: "✅ Summary emailed to your team!",
  },
  { convoId: 'main', role: 'user', content: 'Run this every Monday at 9am' },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    toolCalls: [
      {
        id: 'tc_demo_schedule_digest',
        type: 'function',
        function: {
          name: 'Scheduling…',
          arguments: '{ "agent": "Weekly briefs", "schedule": { "cron": "0 9 * * MON", "timezone": "UTC" } }',
        },
      },
    ],
    noStream: false,
    content: 'On it.',
  },
  {
    convoId: 'main',
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_demo_schedule_digest',
    noStream: true,
    content: JSON.stringify(
      { status: 'ok', action: 'schedule-agent', schedule: { cron: '0 9 * * MON', timezone: 'UTC' } },
      null,
      2
    ),
  },
  {
    convoId: 'main',
    role: 'assistant',
    agentName: 'Aria',
    noStream: true,
    content: "✅ Okay, I'll run this every Monday at 9am.",
  },
]

export default function DelegationDemo() {
  const { data: ariaTemplates = [] } = useAgentTemplates({ search: 'aria' })
  const ariaAvatarUrl = useMemo(() => {
    const aria = ariaTemplates.find(t => t.slug === 'aria' || t.name === 'Aria')
    return aria?.avatarUrl
  }, [ariaTemplates])

  const { data: deanTemplates = [] } = useAgentTemplates({ search: 'dean' })
  const deanAvatarUrl = useMemo(() => {
    const dean = deanTemplates.find(
      t => t.slug === 'dean' || t.name === 'Dean' || String(t.slug ?? '').toLowerCase().startsWith('dean') || String(t.name ?? '').toLowerCase() === 'dean'
    )
    return dean?.avatarUrl
  }, [deanTemplates])

  const { data: claraTemplates = [] } = useAgentTemplates({ search: 'clara' })
  const claraAvatarUrl = useMemo(() => {
    const clara = claraTemplates.find(
      t =>
        t.slug === 'clara' ||
        t.name === 'Clara' ||
        String(t.slug ?? '').toLowerCase().startsWith('clara') ||
        String(t.name ?? '').toLowerCase() === 'clara'
    )
    return clara?.avatarUrl
  }, [claraTemplates])

  const [activeDemoConvoId, setActiveDemoConvoId] = useState<DemoConvoId>('main')
  const [demoByConvo, setDemoByConvo] = useState<Record<DemoConvoId, DemoMessage[]>>({ main: [], dean: [], clara: [] })
  const [respondingByConvo, setRespondingByConvo] = useState<Record<DemoConvoId, boolean>>({ main: false, dean: false, clara: false })
  const [awaitingToolsByConvo, setAwaitingToolsByConvo] = useState<Record<DemoConvoId, boolean>>({ main: false, dean: false, clara: false })

  const containerRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightTopRef = useRef<HTMLDivElement>(null)
  const rightBottomRef = useRef<HTMLDivElement>(null)

  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [paths, setPaths] = useState<{ toDean: string; toClara: string }>({ toDean: '', toClara: '' })

  // Mock streaming effect for the landing conversation demo (multi-chat with switching).
  useEffect(() => {
    let cancelled = false
    const abortController = new AbortController()
    const { sleep, clearAll } = createAbortableSleep(abortController.signal)
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
      while (!cancelled && !abortController.signal.aborted) {
        setRespondingByConvo({ main: false, dean: false, clara: false })
        setAwaitingToolsByConvo({ main: false, dean: false, clara: false })
        setDemoByConvo({ main: [], dean: [], clara: [] })
        setActiveDemoConvoId('main')
        // IMPORTANT: Do not rely on React state for switching decisions inside this async loop
        // (it will be stale inside the closure). Track the active convo locally.
        let activeConvo: DemoConvoId = 'main'
        await sleep(350)

        let now = Date.now()
        const seqByConvo: Record<DemoConvoId, number> = { main: 0, dean: 0, clara: 0 }
        const lastToolRunnerId: Record<DemoConvoId, string | null> = { main: null, dean: null, clara: null }
        const pendingToolIds: Record<DemoConvoId, Set<string>> = { main: new Set(), dean: new Set(), clara: new Set() }

        for (const step of DEMO_TIMELINE) {
          if (cancelled || abortController.signal.aborted) return

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
              if (cancelled || abortController.signal.aborted) return
              // IMPORTANT: `ConversationMessageContent.aggregateStreamChunks` treats `position` as a
              // cumulative character position (not a chunk index).
              position += part.length
              chunks = [...chunks, { content: part, position, timestamp: Date.now() }]
              updateMessage(step.convoId, id, { chunks, streaming: true })
              await sleep(150)
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
        await sleep(20000)
      }
    }

    run().catch(err => console.error('[DelegationDemo] run() failed', err))
    return () => {
      cancelled = true
      abortController.abort()
      clearAll()
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

    let disposed = false
    let rafId: number | null = null

    const compute = () => {
      if (disposed) return
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
      const toDean = {
        x: t.left - c.left,
        y: t.top - c.top + t.height * 0.5,
      }
      const toClara = {
        x: b.left - c.left,
        y: b.top - c.top + b.height * 0.5,
      }

      setSvgSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }))
      setPaths(prev => {
        const next = { toDean: makePath(from, toDean), toClara: makePath(from, toClara) }
        return prev.toDean === next.toDean && prev.toClara === next.toClara ? prev : next
      })
    }

    const rafCompute = () => {
      if (disposed) return
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = null
        compute()
      })
    }
    rafCompute()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(rafCompute) : null
    ro?.observe(container)
    ro?.observe(left)
    ro?.observe(top)
    ro?.observe(bottom)

    window.addEventListener('resize', rafCompute, { passive: true } as any)
    return () => {
      disposed = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      ro?.disconnect()
      window.removeEventListener('resize', rafCompute as any)
    }
  }, [demoByConvo, respondingByConvo, awaitingToolsByConvo])

  const isDeanActive = activeDemoConvoId === 'dean'
  const isClaraActive = activeDemoConvoId === 'clara'

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
        {paths.toDean ? <path d={paths.toDean} className={['delegation-edge', isDeanActive ? 'delegation-edge--active' : ''].join(' ')} /> : null}
        {paths.toClara ? <path d={paths.toClara} className={['delegation-edge', isClaraActive ? 'delegation-edge--active' : ''].join(' ')} /> : null}
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
                  'relative z-10 rounded-2xl overflow-hidden border bg-background shadow-md shadow-black/30',
                  activeDemoConvoId === 'main' ? 'border-amber-300/55' : 'border-white/20',
                ].join(' ')}
              >
                <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background/10 backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                        <AgentAvatar seed={DEMO_CONVERSATIONS.main.leftAgentSeed} imageUrl={ariaAvatarUrl} size={32} />
                      </div>
                      <div className="text-sm font-medium leading-none truncate">
                        {DEMO_CONVERSATIONS.main.leftAgentName} - {DEMO_CONVERSATIONS.main.designation}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="h-[460px] sm:h-[520px] md:h-[640px] flex flex-col">
                  <div className="flex-1 overflow-hidden">
                    <ConversationMessageList
                      conversationId={null}
                      messagesOverride={(demoByConvo.main || []) as any}
                      agentNameOverride={DEMO_CONVERSATIONS.main.leftAgentName}
                      agentAvatarUrlOverride={ariaAvatarUrl}
                      isRespondingOverride={(respondingByConvo.main || false) || (awaitingToolsByConvo.main || false)}
                      isAssistantStreamingOverride={respondingByConvo.main || false}
                      isAwaitingToolResultsOverride={awaitingToolsByConvo.main || false}
                      bottomPaddingPx={100}
                      userNameOverride="You"
                      userAvatarFallbackVariantOverride="user-icon"
                      sizeVariant="delegation"
                    />
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/50 to-transparent" aria-hidden />
                </div>
              </div>
            </div>
          </div>

          {/* Right: two delegated chats */}
          <div className="md:w-[52%] flex flex-col gap-8 md:gap-10">
            {/* Top: Dean (Google Drive) */}
            <div ref={rightTopRef}>
              <div className="relative isolate overflow-visible">
                {/* Glow per-window (only when active) */}
                <div
                  className={[
                    'absolute inset-0 -z-10 rounded-2xl delegation-active-glow pointer-events-none transition-opacity duration-500',
                    activeDemoConvoId === 'dean' ? 'opacity-70' : 'opacity-0',
                  ].join(' ')}
                  aria-hidden
                />
                <div
                  className={[
                    'absolute inset-0 -z-10 rounded-2xl delegation-active-border pointer-events-none transition-opacity duration-500',
                    activeDemoConvoId === 'dean' ? 'opacity-55' : 'opacity-0',
                  ].join(' ')}
                  aria-hidden
                />

                <div
                  className={[
                    'relative z-10 rounded-2xl overflow-hidden border bg-background shadow-md shadow-black/30',
                    activeDemoConvoId === 'dean' ? 'border-amber-300/55' : 'border-white/20',
                  ].join(' ')}
                >
                  <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background/10 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                          <AgentAvatar seed={DEMO_CONVERSATIONS.dean.leftAgentSeed} imageUrl={deanAvatarUrl} size={32} />
                        </div>
                        <div className="text-sm font-medium leading-none truncate">
                          {DEMO_CONVERSATIONS.dean.leftAgentName} - {DEMO_CONVERSATIONS.dean.designation}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-[300px] md:h-[260px] flex flex-col">
                    <div className="flex-1 overflow-hidden">
                      <ConversationMessageList
                        conversationId={null}
                        messagesOverride={(demoByConvo.dean || []) as any}
                        agentNameOverride={DEMO_CONVERSATIONS.dean.leftAgentName}
                        agentAvatarUrlOverride={deanAvatarUrl}
                        isRespondingOverride={(respondingByConvo.dean || false) || (awaitingToolsByConvo.dean || false)}
                        isAssistantStreamingOverride={respondingByConvo.dean || false}
                        isAwaitingToolResultsOverride={awaitingToolsByConvo.dean || false}
                        bottomPaddingPx={60}
                        userNameOverride={DEMO_CONVERSATIONS.dean.rightUserLabel}
                        userAvatarUrlOverride={ariaAvatarUrl}
                        userAvatarSeedOverride={DEMO_CONVERSATIONS.dean.rightUserSeed}
                        sizeVariant="delegation"
                      />
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background/50 to-transparent" aria-hidden />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom: Clara (Gmail) */}
            <div ref={rightBottomRef}>
              <div className="relative isolate overflow-visible">
                {/* Glow per-window (only when active) */}
                <div
                  className={[
                    'absolute inset-0 -z-10 rounded-2xl delegation-active-glow pointer-events-none transition-opacity duration-500',
                    activeDemoConvoId === 'clara' ? 'opacity-70' : 'opacity-0',
                  ].join(' ')}
                  aria-hidden
                />
                <div
                  className={[
                    'absolute inset-0 -z-10 rounded-2xl delegation-active-border pointer-events-none transition-opacity duration-500',
                    activeDemoConvoId === 'clara' ? 'opacity-55' : 'opacity-0',
                  ].join(' ')}
                  aria-hidden
                />

                <div
                  className={[
                    'relative z-10 rounded-2xl overflow-hidden border bg-background shadow-md shadow-black/30',
                    activeDemoConvoId === 'clara' ? 'border-amber-300/55' : 'border-white/20',
                  ].join(' ')}
                >
                  <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background/10 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                          <AgentAvatar seed={DEMO_CONVERSATIONS.clara.leftAgentSeed} imageUrl={claraAvatarUrl} size={32} />
                        </div>
                        <div className="text-sm font-medium leading-none truncate">
                          {DEMO_CONVERSATIONS.clara.leftAgentName} - {DEMO_CONVERSATIONS.clara.designation}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-[300px] md:h-[260px] flex flex-col">
                    <div className="flex-1 overflow-hidden">
                      <ConversationMessageList
                        conversationId={null}
                        messagesOverride={(demoByConvo.clara || []) as any}
                        agentNameOverride={DEMO_CONVERSATIONS.clara.leftAgentName}
                        agentAvatarUrlOverride={claraAvatarUrl}
                        isRespondingOverride={(respondingByConvo.clara || false) || (awaitingToolsByConvo.clara || false)}
                        isAssistantStreamingOverride={respondingByConvo.clara || false}
                        isAwaitingToolResultsOverride={awaitingToolsByConvo.clara || false}
                        bottomPaddingPx={60}
                        userNameOverride={DEMO_CONVERSATIONS.clara.rightUserLabel}
                        userAvatarUrlOverride={ariaAvatarUrl}
                        userAvatarSeedOverride={DEMO_CONVERSATIONS.clara.rightUserSeed}
                        sizeVariant="delegation"
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
          border: 2px solid rgba(255, 255, 255, 0.34);
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


