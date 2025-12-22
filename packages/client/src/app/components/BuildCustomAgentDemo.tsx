'use client'

import { useEffect, useRef, useState } from 'react'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import { AgentBuilderView, type AgentBuilderViewRef } from '@/components/agents/AgentBuilder'

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

async function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export default function BuildCustomAgentDemo() {
  const [messages, setMessages] = useState<DemoMessage[]>([])
  const [isUserActive, setIsUserActive] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [isAwaitingTools, setIsAwaitingTools] = useState(false)
  const [isFormStreaming, setIsFormStreaming] = useState(false)
  const [agentTitle, setAgentTitle] = useState<string>('New agent')

  const agentBuilderRef = useRef<AgentBuilderViewRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [path, setPath] = useState<string>('')

  useEffect(() => {
    let cancelled = false

    const appendMessage = (msg: DemoMessage) => setMessages(prev => [...prev, msg])
    const updateMessage = (id: string, patch: Partial<DemoMessage>) => {
      setMessages(prev => prev.map(m => (m.id === id ? ({ ...m, ...patch } as DemoMessage) : m)))
    }

    const streamAssistant = async (id: string, content: string) => {
      const parts = chunkTextForStreaming(content)
      let position = 0
      let chunks: DemoStreamChunk[] = []
      for (const part of parts) {
        if (cancelled) return
        chunks = [...chunks, { content: part, position, timestamp: Date.now() }]
        position += 1
        updateMessage(id, { chunks, streaming: true })
        await sleep(105)
      }
      updateMessage(id, { content, streaming: false, updatedAt: new Date().toISOString() })
    }

    const streamForm = async () => {
      if (!agentBuilderRef.current) return
      setIsFormStreaming(true)

      try {
        agentBuilderRef.current.resetForm()
      } catch {}
      setAgentTitle('New agent')

      const setField = async (field: any, value: any, delay = 320) => {
        if (cancelled) return
        try {
          agentBuilderRef.current?.updateField(field, value)
        } catch {}
        await sleep(delay)
      }

      const streamTextField = async (field: any, full: string, delay = 40) => {
        if (cancelled) return
        let cur = ''
        for (const part of chunkTextForStreaming(full)) {
          if (cancelled) return
          cur += part
          try {
            agentBuilderRef.current?.updateField(field, cur)
          } catch {}
          if (field === 'name') {
            const nextName = cur.trim()
            if (nextName) setAgentTitle(nextName)
          }
          await sleep(delay)
        }
      }

      const name = 'Customer Inbox Assistant'
      const slug = 'customer-inbox-assistant'
      const description = 'Summarize inbound customer emails and draft friendly replies for approval.'
      const systemPrompt =
        [
          'You are the Customer Inbox Assistant.',
          '',
          'Goal:',
          '- Turn raw inbound customer emails into a short, accurate summary and a suggested reply.',
          '',
          'Rules:',
          '- Be warm, concise, and professional.',
          '- Ask 1-2 clarifying questions only when absolutely needed.',
          '- If an email is angry or urgent, de-escalate and escalate to a human.',
          '- Never send emails directly; always output a draft for approval.',
          '',
          'Output format:',
          '1) Summary (3 bullets max)',
          '2) Draft reply (ready to copy/paste)',
          '3) Escalation flags (if any)',
        ].join('\n')

      await streamTextField('name', name, 55)
      await setField('slug', slug, 420)
      await streamTextField('description', description, 50)
      await setField('category', 'support', 380)
      await setField('model', 'openai/gpt-4o-mini', 380)
      await setField('temperature', 0.4, 340)
      await setField('maxTokens', 1200, 340)
      await setField('reasoning', 'low', 340)
      await streamTextField('systemPrompt', systemPrompt, 32)
      await setField('previewPrompts', ['Summarize this email and draft a reply:', 'Draft a polite follow-up asking for missing details.'], 420)
      await setField('assignedToolSlugs', ['search', 'draft_reply'], 420)
      await setField(
        'blueprint',
        JSON.stringify(
          {
            nodes: [
              { id: 'n1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
              { id: 'n2', type: 'llm', position: { x: 250, y: 0 }, data: { label: 'Summarize + draft reply' } },
              { id: 'n3', type: 'end', position: { x: 520, y: 0 }, data: { label: 'End' } },
            ],
            edges: [
              { id: 'e1', source: 'n1', target: 'n2' },
              { id: 'e2', source: 'n2', target: 'n3' },
            ],
          },
          null,
          2
        ),
        320
      )
      await setField('timeout', 60000, 320)

      setIsFormStreaming(false)
    }

    const run = async () => {
      while (!cancelled) {
        setMessages([])
        setIsResponding(false)
        setIsAwaitingTools(false)
        setIsFormStreaming(false)
        setAgentTitle('New agent')
        try {
          agentBuilderRef.current?.resetForm()
        } catch {}

        await sleep(450)

        const now0 = Date.now()
        const userMsg: DemoMessage = {
          id: `demo-u-${now0}`,
          role: 'user',
          content: 'Gaia, create an agent that summarizes customer emails and drafts friendly replies for my approval.',
          createdAt: new Date(now0).toISOString(),
          updatedAt: new Date(now0).toISOString(),
          messageType: 'user_input',
        }
        setIsUserActive(true)
        appendMessage(userMsg)
        await sleep(650)
        setIsUserActive(false)

        const a1Id = `demo-a1-${Date.now()}`
        appendMessage({
          id: a1Id,
          role: 'assistant',
          agentName: 'Gaia',
          content: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageType: 'agent_response',
          streaming: true,
          chunks: [],
        })
        setIsResponding(true)
        await streamAssistant(
          a1Id,
          [
            "Got it. I’ll create an agent with a warm, customer-friendly voice and an approval step before anything is sent.",
            '',
            'I’m opening the agent builder now and filling in the spec…',
          ].join('\n')
        )
        setIsResponding(false)
        await sleep(300)

        const toolCallId = 'tc_demo_open_agent_landing'
        const toolRunnerId = `demo-a2-${Date.now()}`
        appendMessage({
          id: toolRunnerId,
          role: 'assistant',
          agentName: 'Gaia',
          content: 'Opening the agent builder…',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageType: 'agent_response',
          streaming: false,
          toolCalls: [
            {
              id: toolCallId,
              type: 'function',
              function: {
                name: 'open-agent',
                arguments: '{ "slug": null }',
              },
            },
          ],
        })
        setIsAwaitingTools(true)

        // Start filling the form immediately as the tool call begins.
        await sleep(120)
        await streamForm()

        appendMessage({
          id: `demo-tr-${Date.now()}`,
          role: 'tool',
          messageType: 'tool_result',
          toolCallId,
          content: JSON.stringify(
            {
              status: 'ok',
              action: 'open-agent',
              route: '/ship/yyy/agent/customer-inbox-assistant',
            },
            null,
            2
          ),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        setIsAwaitingTools(false)

        await sleep(250)

        const a3Id = `demo-a3-${Date.now()}`
        appendMessage({
          id: a3Id,
          role: 'assistant',
          agentName: 'Gaia',
          content: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageType: 'agent_response',
          streaming: true,
          chunks: [],
        })
        setIsResponding(true)
        await streamAssistant(
          a3Id,
          [
            '✅ Done. I created **Customer Inbox Assistant**.',
            '',
            '- It summarizes each email (3 bullets max)',
            '- Drafts a warm reply for your approval',
            '- Escalates urgent or angry threads to a human',
            '',
            'Want it to match your exact brand voice (more formal, more casual, etc.)?',
          ].join('\n')
        )
        setIsResponding(false)

        await sleep(2600)
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // DelegationDemo-style connector path (left chat -> right builder)
  useEffect(() => {
    const container = containerRef.current
    const left = leftRef.current
    const right = rightRef.current
    if (!container || !left || !right) return

    const makePath = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const dx = Math.max(80, Math.min(220, (to.x - from.x) * 0.55))
      return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
    }

    const compute = () => {
      const c = container.getBoundingClientRect()
      const l = left.getBoundingClientRect()
      const r = right.getBoundingClientRect()

      const w = Math.max(0, Math.round(c.width))
      const h = Math.max(0, Math.round(c.height))

      const from = { x: l.right - c.left, y: l.top - c.top + l.height * 0.5 }
      const to = { x: r.left - c.left, y: r.top - c.top + r.height * 0.5 }

      setSvgSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }))
      const next = makePath(from, to)
      setPath(prev => (prev === next ? prev : next))
    }

    const rafCompute = () => requestAnimationFrame(compute)
    rafCompute()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(rafCompute) : null
    ro?.observe(container)
    ro?.observe(left)
    ro?.observe(right)

    window.addEventListener('resize', rafCompute, { passive: true } as any)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', rafCompute as any)
    }
  }, [messages.length, isResponding, isAwaitingTools, isFormStreaming])

  const isEdgeActive = isAwaitingTools || isFormStreaming
  const isRightActive = isAwaitingTools || isFormStreaming
  const isLeftActive = (isUserActive || isResponding) && !isRightActive

  return (
    <div ref={containerRef} className="relative isolate w-full overflow-visible text-left">
      {/* Connector path (desktop only; mobile stacks windows) */}
      <svg
        className="hidden md:block absolute inset-0 pointer-events-none"
        width={svgSize.w}
        height={svgSize.h}
        viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {path ? <path d={path} className={['delegation-edge', isEdgeActive ? 'delegation-edge--active' : ''].join(' ')} /> : null}
      </svg>

      <div className="relative z-10 grid gap-6 md:grid-cols-2 md:gap-20 lg:gap-24 xl:gap-28">
      {/* Left: mock conversation */}
      <div ref={leftRef} className="relative isolate overflow-visible">
        {/* Glow per-window (only when active) */}
        <div
          className={[
            'absolute inset-0 -z-10 rounded-2xl delegation-active-glow pointer-events-none transition-opacity duration-500',
            isLeftActive ? 'opacity-70' : 'opacity-0',
          ].join(' ')}
          aria-hidden
        />
        <div
          className={[
            'absolute inset-0 -z-10 rounded-2xl delegation-active-border pointer-events-none transition-opacity duration-500',
            isLeftActive ? 'opacity-55' : 'opacity-0',
          ].join(' ')}
          aria-hidden
        />

        <div
          className={[
            'relative z-10 rounded-2xl overflow-hidden border bg-background shadow-md shadow-black/30',
            isLeftActive ? 'border-amber-300/55' : 'border-white/20',
          ].join(' ')}
        >
          <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background/10 backdrop-blur">
            <div className="text-sm font-medium leading-none truncate">Building Customer Inbox Agent with Gaia</div>
            <div className="mt-1 text-xs text-muted-foreground truncate">You, Gaia</div>
          </div>
          <div className="h-[440px] sm:h-[520px] flex flex-col">
            <div className="flex-1 overflow-hidden">
              <ConversationMessageList
                conversationId={null}
                messagesOverride={(messages || []) as any}
                agentNameOverride="Gaia"
                isRespondingOverride={isResponding || isAwaitingTools}
                isAssistantStreamingOverride={isResponding}
                isAwaitingToolResultsOverride={isAwaitingTools}
                bottomPaddingPx={120}
                userNameOverride="You"
                userAvatarSeedOverride="You"
              />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/50 to-transparent" aria-hidden />
          </div>
        </div>
      </div>

      {/* Right: embedded agent builder form */}
      <div ref={rightRef} className="relative isolate overflow-visible">
        {/* Glow per-window (only when active) */}
        <div
          className={[
            'absolute inset-0 -z-10 rounded-2xl delegation-active-glow pointer-events-none transition-opacity duration-500',
            isRightActive ? 'opacity-70' : 'opacity-0',
          ].join(' ')}
          aria-hidden
        />
        <div
          className={[
            'absolute inset-0 -z-10 rounded-2xl delegation-active-border pointer-events-none transition-opacity duration-500',
            isRightActive ? 'opacity-55' : 'opacity-0',
          ].join(' ')}
          aria-hidden
        />

        <div
          className={[
            'relative z-10 rounded-2xl overflow-hidden border bg-background shadow-md shadow-black/30',
            isRightActive ? 'border-amber-300/55' : 'border-white/20',
          ].join(' ')}
        >
          <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background/10 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium leading-none truncate">{agentTitle || 'New agent'}</div>
                <div className="mt-1 text-xs text-muted-foreground truncate">Agent Builder</div>
              </div>
              {isFormStreaming ? (
                <div className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/30 text-amber-300 bg-amber-500/10">filling…</div>
              ) : isAwaitingTools ? (
                <div className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/30 text-amber-300 bg-amber-500/10">opening…</div>
              ) : (
                <div className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-400/25 text-emerald-300 bg-emerald-500/10">ready</div>
              )}
            </div>
          </div>

          <div className="h-[440px] sm:h-[520px] overflow-auto">
            <AgentBuilderView ref={agentBuilderRef} readOnly={true} embedded={true} />
          </div>
        </div>
      </div>
      </div>

      {/* Match DelegationDemo connector styling */}
      <style jsx>{`
        .delegation-active-glow::before {
          content: '';
          position: absolute;
          inset: -14px;
          border-radius: inherit;
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


