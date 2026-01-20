'use client'

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import Icon from '@/components/primitives/Icon'
import { useAgentTemplates } from '@/hooks/useTemplates'
import { cn } from '@/lib/utils'
import type { AgentTemplateModel } from '@starships/protocol'

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

type ConvoId = 'aria' | 'iris' | 'saga'

type ConvoFlags = {
  responding: boolean
  awaitingTools: boolean
  isRunning: boolean
  hasRun: boolean
}

type ConvoFlagsByConvo = Record<ConvoId, ConvoFlags>

const INITIAL_CONVO_FLAGS: ConvoFlagsByConvo = {
  aria: { responding: false, awaitingTools: false, isRunning: false, hasRun: false },
  iris: { responding: false, awaitingTools: false, isRunning: false, hasRun: false },
  saga: { responding: false, awaitingTools: false, isRunning: false, hasRun: false },
}

type ConvoFlagsAction = { type: 'patch'; convoId: ConvoId; patch: Partial<ConvoFlags> } | { type: 'reset'; convoId: ConvoId }

function convoFlagsReducer(state: ConvoFlagsByConvo, action: ConvoFlagsAction): ConvoFlagsByConvo {
  switch (action.type) {
    case 'patch': {
      const prev = state[action.convoId]
      const next = { ...prev, ...action.patch }
      if (prev.responding === next.responding && prev.awaitingTools === next.awaitingTools && prev.isRunning === next.isRunning && prev.hasRun === next.hasRun) {
        return state
      }
      return { ...state, [action.convoId]: next }
    }
    case 'reset': {
      const prev = state[action.convoId]
      const next: ConvoFlags = { ...prev, responding: false, awaitingTools: false, isRunning: false }
      if (prev.responding === next.responding && prev.awaitingTools === next.awaitingTools && prev.isRunning === next.isRunning && prev.hasRun === next.hasRun) {
        return state
      }
      return { ...state, [action.convoId]: next }
    }
    default:
      return state
  }
}

type ConvoConfig = {
  id: ConvoId
  label: string
  tabName: string
  actorName: string
  agentSeed: string
  designation: string
  subtitle: string
}

const CONVOS: Record<ConvoId, ConvoConfig> = {
  aria: {
    id: 'aria',
    label: 'Aria - Agent Orchestrator',
    tabName: 'Demo',
    actorName: 'Aria',
    agentSeed: 'Aria',
    designation: 'Agent Orchestrator',
    subtitle: 'Live Demo',
  },
  iris: {
    id: 'iris',
    label: 'Clara - Gmail specialist',
    tabName: 'Inbox',
    actorName: 'Clara',
    agentSeed: 'Clara',
    designation: 'Gmail specialist',
    subtitle: 'Sort inbox, draft replies in Gmail',
  },
  saga: {
    id: 'saga',
    label: 'Saga - WordPress',
    tabName: 'Blog',
    actorName: 'Saga',
    agentSeed: 'Saga',
    designation: 'WordPress',
    subtitle: 'Write and publish a post in WordPress',
  },
}

type Step = {
  role: 'user' | 'assistant' | 'tool'
  content: string
  agentName?: string
  messageType?: DemoMessage['messageType']
  toolCalls?: any[]
  toolCallId?: string
  noStream?: boolean
}

function chunkTextForStreaming(text: string) {
  const tokens = String(text)
    .split(/(\s+)/)
    .filter(t => t.length > 0)
  const parts: string[] = []
  let buf = ''
  for (const t of tokens) {
    buf += t
    if (buf.length >= 18 || t.includes('\n')) {
      parts.push(buf)
      buf = ''
    }
  }
  if (buf) parts.push(buf)
  return parts.length > 0 ? parts : [text]
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

const ARIA_TIMELINE: Step[] = [
  {
    role: 'user',
    content: 'What can Starships.ai do?',
  },
  {
    role: 'assistant',
    agentName: 'Aria',
    content:
      'Starships.ai gives you AI teammates that:\n\n- 📈 **Help you scale your brand across platforms.**\n- 💤 **Work while you sleep by automating your tasks.**\n- 📱 **Collaborate across apps to fit your custom needs.**\n\nPick a quick demo:',
  },
]

const SAGA_TIMELINE: Step[] = [
  {
    role: 'user',
    content:
      'Saga: publish a blog post.\n\nTopic: "AI staff: what it is and how teams use it."\n\nDraft + SEO, save as draft.',
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    toolCalls: [{ id: 'tc_wp_site', type: 'function', function: { name: 'get_site_info', arguments: '{}' } }],
    content: 'On it. I’ll check your site, then outline, draft with SEO, and save as a draft for your review.',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_site',
    noStream: true,
    content: JSON.stringify({ status: 'ok', site: 'Starships.ai Blog' }),
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    toolCalls: [{ id: 'tc_wp_draft', type: 'function', function: { name: 'draft_post', arguments: '{"topic":"AI staff","targetWords":1200}' } }],
    content: 'Drafting the article with outline and SEO; next I’ll save it as a draft for your review.',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_draft',
    noStream: true,
    content: JSON.stringify({ status: 'ok', words: 1235 }),
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    toolCalls: [{ id: 'tc_wp_create', type: 'function', function: { name: 'create_post', arguments: '{"status":"draft"}' } }],
    content: 'Saving as draft…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_create',
    noStream: true,
    content: JSON.stringify({ status: 'ok', postId: 1042, statusAfter: 'draft' }),
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    content:
      '✅ Done\n\n- **AI Staff: What It Is**\n- **1,235 words** (~6 min)\n- **Draft** (not published)\n\nWant me to add an FAQ section, or focus the examples on Ops or Engineering?',
  },
]

const IRIS_TIMELINE: Step[] = [
  {
    role: 'user',
    content: 'Clara: sort my Gmail inbox. Label, archive promos, draft top 3.',
  },
  {
    role: 'assistant',
    agentName: 'Clara',
    toolCalls: [{ id: 'tc_ir_scan', type: 'function', function: { name: 'list_unread', arguments: '{"limit":80}' } }],
    content: 'On it. I’ll pull unread, find what needs a reply, then label, archive, and draft the top 3 for you.',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_scan',
    noStream: true,
    content: JSON.stringify({ status: 'ok', unread: 63, needsReply: 14 }),
  },
  {
    role: 'assistant',
    agentName: 'Clara',
    toolCalls: [{ id: 'tc_ir_file', type: 'function', function: { name: 'classify_threads', arguments: '{"labels":["Sales","Support","Bills","Newsletter"]}' } }],
    content: 'Labeling by topic and archiving newsletters and promos; next I’ll draft the top 3 for your review.',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_file',
    noStream: true,
    content: JSON.stringify({ status: 'ok', labeled: 63, archived: 30 }),
  },
  {
    role: 'assistant',
    agentName: 'Clara',
    toolCalls: [{ id: 'tc_ir_draft', type: 'function', function: { name: 'draft_reply', arguments: '{"count":3}' } }],
    content: 'Drafting replies for the top 3 that need your attention; you review before sending.',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_draft',
    noStream: true,
    content: JSON.stringify({ status: 'ok', drafts: 3 }),
  },
  {
    role: 'assistant',
    agentName: 'Clara',
    content:
      '✅ Done\n\n- **63** unread\n- **14** need reply\n- **30** archived\n- **3** drafts\n\nWant me to apply an auto-label rule for newsletters going forward, or keep it manual?',
  },
]

function useConvoTimelines() {
  return useMemo<Record<ConvoId, Step[]>>(
    () => ({
      aria: ARIA_TIMELINE,
      iris: IRIS_TIMELINE,
      saga: SAGA_TIMELINE,
    }),
    []
  )
}

export default function HeroConversationDemo(props: { initialAgentTemplates?: AgentTemplateModel[] }) {
  const initialAgentTemplates = props.initialAgentTemplates ?? []
  const useServerInitial = initialAgentTemplates.length > 0

  const { data: ariaTemplatesQ = [] } = useAgentTemplates({ search: 'aria' }, !useServerInitial)
  const ariaAvatarUrl = useMemo(() => {
    const list = (useServerInitial ? initialAgentTemplates : ariaTemplatesQ) as AgentTemplateModel[]
    const aria = list.find(
      t =>
        t.slug === 'aria' ||
        t.name === 'Aria' ||
        String(t.slug ?? '')
          .toLowerCase()
          .startsWith('aria')
    )
    return aria?.avatarUrl
  }, [ariaTemplatesQ, initialAgentTemplates, useServerInitial])

  const { data: irisTemplatesQ = [] } = useAgentTemplates({ search: 'iris' }, !useServerInitial)
  const irisAvatarUrl = useMemo(() => {
    const list = (useServerInitial ? initialAgentTemplates : irisTemplatesQ) as AgentTemplateModel[]
    const found = list.find(
      t =>
        t.slug === 'iris' ||
        t.slug === 'clara' ||
        t.name === 'Iris' ||
        t.name === 'Clara' ||
        String(t.slug ?? '')
          .toLowerCase()
          .startsWith('iris') ||
        String(t.slug ?? '')
          .toLowerCase()
          .startsWith('clara')
    )
    return found?.avatarUrl
  }, [initialAgentTemplates, irisTemplatesQ, useServerInitial])

  const { data: sagaTemplatesQ = [] } = useAgentTemplates({ search: 'saga' }, !useServerInitial)
  const sagaAvatarUrl = useMemo(() => {
    const list = (useServerInitial ? initialAgentTemplates : sagaTemplatesQ) as AgentTemplateModel[]
    const saga = list.find(
      t =>
        t.slug === 'saga' ||
        t.name === 'Saga' ||
        String(t.slug ?? '')
          .toLowerCase()
          .startsWith('saga')
    )
    return saga?.avatarUrl
  }, [initialAgentTemplates, sagaTemplatesQ, useServerInitial])

  const timelines = useConvoTimelines()
  const [activeConvoId, setActiveConvoId] = useState<ConvoId>('aria')
  const [messagesByConvo, setMessagesByConvo] = useState<Record<ConvoId, DemoMessage[]>>({ aria: [], iris: [], saga: [] })
  const [flagsByConvo, dispatchConvoFlags] = useReducer(convoFlagsReducer, INITIAL_CONVO_FLAGS)
  const runSeqRef = useState(() => ({ aria: 0, iris: 0, saga: 0 }))[0]
  const demoChooserClockRef = useRef<number>(Date.now())
  const [demoChoiceState, setDemoChoiceState] = useState<{ stage: 'choose' | 'calling' | 'done'; selected: ConvoId | null }>({
    stage: 'choose',
    selected: null,
  })
  const [demoChooserBlinkIndex, setDemoChooserBlinkIndex] = useState(0)
  const [isDemoChooserHovered, setIsDemoChooserHovered] = useState(false)

  const abortControllerRef = useRef<AbortController>(new AbortController())
  const sleepCtlRef = useRef<ReturnType<typeof createAbortableSleep>>(createAbortableSleep(abortControllerRef.current.signal))
  const sleep = sleepCtlRef.current.sleep
  const signal = abortControllerRef.current.signal

  useEffect(() => {
    return () => {
      abortControllerRef.current.abort()
      sleepCtlRef.current.clearAll()
    }
  }, [])

  // Autoplay only the "Demo" conversation.
  useEffect(() => {
    // Fire-and-forget; startConversation handles re-entrancy.
    startConversation('aria')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nextDemoChooserIso = () => {
    demoChooserClockRef.current = Math.max(Date.now(), demoChooserClockRef.current + 1)
    return new Date(demoChooserClockRef.current).toISOString()
  }

  const appendDemoChooserMessage = (cid: ConvoId, msg: DemoMessage) => {
    setMessagesByConvo(prev => ({ ...prev, [cid]: [...(prev[cid] || []), msg] }))
  }

  const handleDemoChoice = async (target: Exclude<ConvoId, 'aria'>) => {
    if (demoChoiceState.stage === 'calling') return
    setDemoChoiceState({ stage: 'calling', selected: target })

    // Append interaction into the Demo (Aria) conversation, then switch tabs after the call-agent succeeds.
    const convoId: ConvoId = 'aria'
    if (signal.aborted) return

    // User "click"
    const userCreatedAt = nextDemoChooserIso()
    appendDemoChooserMessage(convoId, {
      id: `demo-${convoId}-u-choice-${userCreatedAt}`,
      role: 'user',
      content: target === 'iris' ? 'Sort my inbox' : 'Publish a blog post',
      createdAt: userCreatedAt,
      updatedAt: userCreatedAt,
      messageType: 'user_input',
    })

    await sleep(350)
    if (signal.aborted) return

    // Aria acknowledgement
    const a1CreatedAt = nextDemoChooserIso()
    appendDemoChooserMessage(convoId, {
      id: `demo-${convoId}-a-ack-${a1CreatedAt}`,
      role: 'assistant',
      agentName: 'Aria',
      content: target === 'iris' ? 'Starting **Clara** to sort your inbox.' : 'Starting **Saga** for the blog post.',
      createdAt: a1CreatedAt,
      updatedAt: a1CreatedAt,
      messageType: 'agent_response',
      streaming: false,
    })

    await sleep(350)
    if (signal.aborted) return

    // Tool runner: call-agent
    const toolCallId = target === 'iris' ? 'tc_demo_call_iris' : 'tc_demo_call_saga'
    const toolRunnerAt = nextDemoChooserIso()
    appendDemoChooserMessage(convoId, {
      id: `demo-${convoId}-a-tools-${toolRunnerAt}`,
      role: 'assistant',
      agentName: 'Aria',
      content: '',
      createdAt: toolRunnerAt,
      updatedAt: toolRunnerAt,
      messageType: 'agent_response',
      streaming: false,
      toolCalls: [
        {
          id: toolCallId,
          type: 'function',
          function: {
            name: 'call-agent',
            arguments:
              target === 'iris'
                ? '{ "agent": "Clara", "task": "Sort my Gmail inbox", "conversationTitle": "Clara, Demo" }'
                : '{ "agent": "Saga", "task": "Publish a blog post as a draft in WordPress", "conversationTitle": "Saga, Demo" }',
          },
        },
      ],
    })
    dispatchConvoFlags({ type: 'patch', convoId: 'aria', patch: { awaitingTools: true } })

    await sleep(520)
    if (signal.aborted) return

    const toolResultAt = nextDemoChooserIso()
    appendDemoChooserMessage(convoId, {
      id: `demo-${convoId}-tr-${toolResultAt}`,
      role: 'tool',
      content: JSON.stringify(
        {
          status: 'ok',
          delegatedTo: target === 'iris' ? 'Clara' : 'Saga',
          conversation: {
            id: target === 'iris' ? 'c_demo_iris' : 'c_demo_saga',
          },
        },
        null,
        2
      ),
      createdAt: toolResultAt,
      updatedAt: toolResultAt,
      messageType: 'tool_result',
      toolCallId,
    })
    dispatchConvoFlags({ type: 'patch', convoId: 'aria', patch: { awaitingTools: false } })

    await sleep(350)
    if (signal.aborted) return

    const a2CreatedAt = nextDemoChooserIso()
    appendDemoChooserMessage(convoId, {
      id: `demo-${convoId}-a-switch-${a2CreatedAt}`,
      role: 'assistant',
      agentName: 'Aria',
      content: target === 'iris' ? 'Switching you to **Clara**.' : 'Switching you to **Saga**.',
      createdAt: a2CreatedAt,
      updatedAt: a2CreatedAt,
      messageType: 'agent_response',
      streaming: false,
    })

    await sleep(300)
    if (signal.aborted) return

    setDemoChoiceState({ stage: 'done', selected: target })
    setActiveConvoId(target)
    // Start the selected agent demo stream.
    startConversation(target)
  }

  const startConversation = async (convoId: ConvoId) => {
    if (flagsByConvo[convoId]?.isRunning) return
    runSeqRef[convoId] += 1
    const runSeq = runSeqRef[convoId]
    if (signal.aborted) return
    const appendMessage = (cid: ConvoId, msg: DemoMessage) => {
      setMessagesByConvo(prev => ({ ...prev, [cid]: [...(prev[cid] || []), msg] }))
    }
    const updateMessage = (cid: ConvoId, id: string, patch: Partial<DemoMessage>) => {
      setMessagesByConvo(prev => ({
        ...prev,
        [cid]: (prev[cid] || []).map(m => (m.id === id ? ({ ...m, ...patch } as any) : m)),
      }))
    }

    dispatchConvoFlags({ type: 'patch', convoId, patch: { isRunning: true, hasRun: true } })

    try {
      const timeline = timelines[convoId] || []
      setMessagesByConvo(prev => ({ ...prev, [convoId]: [] }))
      dispatchConvoFlags({ type: 'patch', convoId, patch: { responding: false, awaitingTools: false } })

      let seq = 0
      let lastToolRunnerId: string | null = null
      let pendingToolIds = new Set<string>()
      // Use a single monotonic clock per conversation so createdAt/updatedAt and streaming chunk timestamps
      // stay consistent. (ConversationMessageList uses these timestamps to decide loader states.)
      let logicalTs = Date.now()
      const nextTs = () => {
        logicalTs = Math.max(Date.now(), logicalTs + 1)
        return logicalTs
      }
      const nextIso = () => new Date(nextTs()).toISOString()

      await sleep(250)
      if (signal.aborted) return

      for (const step of timeline) {
        // Cancel if another run for this conversation started.
        if (runSeqRef[convoId] !== runSeq) return
        if (signal.aborted) return

        seq += 1
        const createdAt = nextIso()

        if (step.role === 'user') {
          const id = `demo-${convoId}-u${seq}-${logicalTs}`
          appendMessage(convoId, { id, role: 'user', content: step.content, createdAt, updatedAt: createdAt, messageType: 'user_input' })
          await sleep(700)
          if (signal.aborted) return
          continue
        }

        if (step.messageType === 'tool_result' || step.role === 'tool') {
          const id = `demo-${convoId}-tr${seq}-${logicalTs}`
          appendMessage(convoId, { id, role: 'tool', content: step.content, createdAt, updatedAt: createdAt, messageType: 'tool_result', toolCallId: step.toolCallId })
          if (lastToolRunnerId) updateMessage(convoId, lastToolRunnerId, { streaming: false })
          if (step.toolCallId) pendingToolIds.delete(step.toolCallId)
          dispatchConvoFlags({ type: 'patch', convoId, patch: { awaitingTools: pendingToolIds.size > 0 } })
          await sleep(420)
          if (signal.aborted) return
          continue
        }

        const id = `demo-${convoId}-a${seq}-${logicalTs}`
        const hasToolCalls = Array.isArray(step.toolCalls) && step.toolCalls.length > 0

        // Always stream the narrative first WITHOUT tool calls, then emit a separate tool-runner message.
        appendMessage(convoId, {
          id,
          role: 'assistant',
          agentName: step.agentName ?? CONVOS[convoId].actorName,
          content: '',
          createdAt,
          updatedAt: createdAt,
          messageType: 'agent_response',
          streaming: !step.noStream,
          chunks: [],
        })
        dispatchConvoFlags({ type: 'patch', convoId, patch: { responding: true } })

        if (!step.noStream) {
          const parts = chunkTextForStreaming(step.content)
          // IMPORTANT: `ConversationMessageContent.aggregateStreamChunks` treats `position` as a
          // cumulative character position (not a chunk index). If we use 0,1,2,... the aggregator
          // will drop all subsequent chunks once the first chunk is longer than position.
          let position = 0
          let chunks: DemoStreamChunk[] = []
          for (const part of parts) {
            if (runSeqRef[convoId] !== runSeq) return
            if (signal.aborted) return
            position += part.length
            chunks = [...chunks, { content: part, position, timestamp: nextTs() }]
            updateMessage(convoId, id, { chunks, streaming: true })
            await sleep(70)
            if (signal.aborted) return
          }
        } else {
          updateMessage(convoId, id, { content: step.content, streaming: true })
          await sleep(160)
          if (signal.aborted) return
        }

        updateMessage(convoId, id, { content: step.content, streaming: false, updatedAt: nextIso() })
        dispatchConvoFlags({ type: 'patch', convoId, patch: { responding: false } })

        if (hasToolCalls) {
          seq += 1
          const toolCreatedAt = nextIso()
          const toolRunnerId = `demo-${convoId}-a${seq}-${logicalTs}`
          appendMessage(convoId, {
            id: toolRunnerId,
            role: 'assistant',
            agentName: step.agentName ?? CONVOS[convoId].actorName,
            content: '',
            createdAt: toolCreatedAt,
            updatedAt: toolCreatedAt,
            messageType: 'agent_response',
            streaming: false,
            ...(Array.isArray(step.toolCalls) ? ({ toolCalls: step.toolCalls } as any) : {}),
          })

          lastToolRunnerId = toolRunnerId
          const ids = (step.toolCalls || [])
            .map((tc: any) => tc?.id ?? tc?.call_id ?? tc?.toolCallId ?? tc?.function?.id)
            .filter(Boolean)
            .map((x: any) => String(x))
          pendingToolIds = new Set(ids)
          dispatchConvoFlags({ type: 'patch', convoId, patch: { awaitingTools: ids.length > 0 } })
          await sleep(250)
          if (signal.aborted) return
        } else {
          await sleep(900)
          if (signal.aborted) return
        }
      }
    } finally {
      dispatchConvoFlags({ type: 'patch', convoId, patch: { responding: false, awaitingTools: false, isRunning: false } })
    }
  }

  const cfg = CONVOS[activeConvoId]
  const actorsLine = `${cfg.actorName} - ${cfg.designation}`
  const agentAvatarUrlOverride = cfg.id === 'aria' ? ariaAvatarUrl : cfg.id === 'iris' ? irisAvatarUrl : cfg.id === 'saga' ? sagaAvatarUrl : undefined
  const isResponding = (flagsByConvo[activeConvoId]?.responding ?? false) || (flagsByConvo[activeConvoId]?.awaitingTools ?? false)
  const isRunning = flagsByConvo[activeConvoId]?.isRunning ?? false
  const hasRun = flagsByConvo[activeConvoId]?.hasRun ?? false
  const hasAnyMessages = (messagesByConvo[activeConvoId] || []).length > 0
  const isAutoplayTab = activeConvoId === 'aria'
  const showDemoChooser = activeConvoId === 'aria' && flagsByConvo.aria.hasRun && !flagsByConvo.aria.isRunning && demoChoiceState.stage === 'choose' && (messagesByConvo.aria?.length || 0) > 0
  const isDemoCalling = activeConvoId === 'aria' && demoChoiceState.stage === 'calling'

  // Blink demo chooser buttons one by one (primary) when visible; pause while hovering
  useEffect(() => {
    if (!showDemoChooser || isDemoChooserHovered) return
    const id = setInterval(() => setDemoChooserBlinkIndex(i => (i === 0 ? 1 : 0)), 1800)
    return () => clearInterval(id)
  }, [showDemoChooser, isDemoChooserHovered])

  const handleRestart = () => {
    // Restart should fully reset the Demo chooser state so the two choice buttons appear again
    // after the Demo (Aria) autoplay finishes.
    if (activeConvoId === 'aria') {
      setDemoChoiceState({ stage: 'choose', selected: null })
    }
    startConversation(activeConvoId)
  }

  return (
    <div className="relative isolate w-full overflow-visible text-left">
      <div className="absolute inset-0 -z-10 rounded-2xl video-glow opacity-80 pointer-events-none" aria-hidden />
      <div className="absolute inset-0 -z-10 rounded-2xl video-blur-border opacity-90 pointer-events-none" aria-hidden />

      <div className="relative z-10 rounded-2xl shadow-2xl overflow-hidden border border-border/40 bg-background">
        <div
          className="relative w-full"
          style={{
            background: 'radial-gradient(1000px 700px at 20% 20%, rgba(245, 158, 11, 0.10) 0%, transparent 58%), radial-gradient(1000px 700px at 80% 80%, rgba(217, 119, 6, 0.07) 0%, transparent 56%)',
          }}
        >
          <div className="h-[640px] sm:h-[620px] md:h-[680px] flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background/10 backdrop-blur">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  {/* Title */}
                  <div className={cn('font-medium leading-none truncate', cfg.id === 'aria' ? 'text-base' : 'text-sm')}>{cfg.subtitle}</div>
                  {/* Actors */}
                  <div className="mt-1 flex items-center gap-2 min-w-0">
                    <div className="text-xs text-muted-foreground truncate">{actorsLine}</div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 flex-wrap sm:flex-nowrap flex-shrink-0 w-full sm:w-auto">
                  {(Object.keys(CONVOS) as ConvoId[]).map(id => {
                    const active = id === activeConvoId
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActiveConvoId(id)}
                        className={[
                          'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          active ? 'bg-primary text-primary-foreground border-primary/40' : 'bg-background/40 text-foreground/80 border-border/50 hover:bg-background/60',
                        ].join(' ')}
                      >
                        {CONVOS[id].tabName}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
              <ConversationMessageList
                conversationId={null}
                messagesOverride={(messagesByConvo[activeConvoId] || []) as any}
                agentNameOverride={cfg.actorName}
                agentAvatarUrlOverride={agentAvatarUrlOverride}
                isRespondingOverride={isResponding}
                isAssistantStreamingOverride={flagsByConvo[activeConvoId]?.responding ?? false}
                isAwaitingToolResultsOverride={flagsByConvo[activeConvoId]?.awaitingTools ?? false}
                bottomPaddingPx={140}
                userNameOverride="You"
                userAvatarFallbackVariantOverride="user-icon"
                sizeVariant="hero"
              />

              {/* Restart control (shown after a run has completed) */}
              {hasAnyMessages && !isRunning && !isResponding && !showDemoChooser && !isDemoCalling && (
                <div className="absolute inset-x-0 bottom-6 flex items-center justify-center px-4">
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="h-11 px-5 rounded-full bg-primary text-primary-foreground border border-primary/40 hover:opacity-95 shadow-lg inline-flex items-center gap-2 justify-center"
                    aria-label={`Restart ${cfg.tabName} demo`}
                  >
                    <Icon name="rotate-ccw" iconOverride={{ type: 'phosphor', component: 'ArrowCounterClockwise' }} weight="bold" className="w-4 h-4" />
                    <span className="text-sm font-semibold">Restart</span>
                  </button>
                </div>
              )}

              {/* Demo chooser buttons (pose as user messages right after the assistant message) */}
              {showDemoChooser && (
                <div className="absolute inset-x-0 bottom-6 px-4">
                  <div className="w-full max-w-4xl mx-auto">
                    <div className="flex justify-end">
                      <div className="mb-4 mt-6 flex w-full sm:w-auto items-end gap-3 max-w-full sm:max-w-[70%]">
                        <div
                          className="flex flex-1 flex-col gap-2 items-end w-full"
                          onMouseEnter={() => setIsDemoChooserHovered(true)}
                          onMouseLeave={() => setIsDemoChooserHovered(false)}
                        >
                          <button
                            type="button"
                            onClick={() => handleDemoChoice('iris')}
                            className={cn(
                              'w-full text-left shadow-sm rounded-2xl rounded-br-md px-4 py-3 border transition-colors duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background backdrop-blur-sm hover:bg-primary/25 hover:text-amber-100 hover:border-primary/50 [&:hover_svg]:text-amber-100',
                              !isDemoChooserHovered && demoChooserBlinkIndex === 0
                                ? 'bg-primary/20 backdrop-blur-sm text-amber-100 border-primary/40 [&_svg]:text-amber-100'
                                : 'bg-card text-card-foreground border-border/50'
                            )}
                            aria-label="Sort my inbox"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-base leading-relaxed">Sort my inbox</div>
                              <Icon name="caret-right" iconOverride={{ type: 'phosphor', component: 'CaretRight' }} weight="bold" className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDemoChoice('saga')}
                            className={cn(
                              'w-full text-left shadow-sm rounded-2xl rounded-br-md px-4 py-3 border transition-colors duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background backdrop-blur-sm hover:bg-primary/25 hover:text-amber-100 hover:border-primary/50 [&:hover_svg]:text-amber-100',
                              !isDemoChooserHovered && demoChooserBlinkIndex === 1
                                ? 'bg-primary/20 backdrop-blur-sm text-amber-100 border-primary/40 [&_svg]:text-amber-100'
                                : 'bg-card text-card-foreground border-border/50'
                            )}
                            aria-label="Publish a blog post"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-base leading-relaxed">Publish a blog post</div>
                              <Icon name="caret-right" iconOverride={{ type: 'phosphor', component: 'CaretRight' }} weight="bold" className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </button>
                        </div>
                        <div className="flex-shrink-0 w-10 h-10 rounded-full ring-1 ring-primary/30 bg-primary/15 backdrop-blur-sm mb-1 overflow-hidden flex items-center justify-center">
                          <Icon name="user" iconOverride={{ type: 'phosphor', component: 'User' }} weight="bold" size={20} className="text-amber-400/90" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isAutoplayTab && !hasAnyMessages && !isRunning && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => startConversation(activeConvoId)}
                    className="w-16 h-16 rounded-full bg-white/10 text-white hover:bg-white/14 border border-white/25 hover:border-white/35 shadow-lg inline-flex items-center justify-center backdrop-blur"
                    aria-label={`Start ${cfg.tabName} demo`}
                  >
                    <Icon name="play" iconOverride={{ type: 'phosphor', component: 'Play' }} weight="fill" className="w-7 h-7 translate-x-[1px]" />
                  </button>
                </div>
              )}
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/50 to-transparent" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  )
}
