'use client'

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import Icon from '@/components/primitives/Icon'
import { useAgentTemplates } from '@/hooks/useTemplates'
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
  subtitle: string
}

const CONVOS: Record<ConvoId, ConvoConfig> = {
  aria: {
    id: 'aria',
    label: 'You ↔ Aria',
    tabName: 'Demo',
    actorName: 'Aria',
    agentSeed: 'Aria',
    subtitle: 'Pick a first‑week win (live demo)',
  },
  iris: {
    id: 'iris',
    label: 'Iris ↔ You',
    tabName: 'Inbox',
    actorName: 'Iris',
    agentSeed: 'Iris',
    subtitle: 'Inbox triage + draft replies in Gmail',
  },
  saga: {
    id: 'saga',
    label: 'Saga ↔ You',
    tabName: 'Blog',
    actorName: 'Saga',
    agentSeed: 'Saga',
    subtitle: 'Write + publish a blog post in WordPress',
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
      'Starships.ai helps you **delegate real work** to AI teammates that can follow workflows and show their progress.\n\n- Get a specialist for a task (ops, marketing, docs, research, etc.)\n- Connect tools/apps and run step‑by‑step with visible tool results\n- Stay in control with guardrails like approvals and reviewable changes\n\nPick a quick demo to see it end‑to‑end:',
  },
]

const SAGA_TIMELINE: Step[] = [
  {
    role: 'user',
    content:
      'Saga — publish a blog post for our site.\n\nTopic:\n- “AI staff: what it is and how teams use it”\n\nGoals:\n- Outline + draft\n- Add SEO title + meta description\n- Create a featured image prompt\n- Publish as a draft (not live)\n- Show progress step-by-step',
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    toolCalls: [
      { id: 'tc_wp_site', type: 'function', function: { name: 'get_site_info', arguments: '{ "cms": "wordpress" }' } },
      { id: 'tc_wp_topics', type: 'function', function: { name: 'list_categories_tags', arguments: '{ "limit": 30 }' } },
      { id: 'tc_wp_recent', type: 'function', function: { name: 'list_recent_posts', arguments: '{ "limit": 5 }' } },
    ],
    content:
      'On it. I’ll do this in phases:\n\n1) Check your WordPress site + existing categories/tags\n2) Outline the post and confirm angle\n3) Draft the article (scannable + practical)\n4) Add SEO title + meta description\n5) Create a featured-image prompt\n6) Publish as a **draft** for review',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_site',
    noStream: true,
    content: JSON.stringify({ status: 'ok', site: 'Starships.ai Blog', url: 'https://starships.ai', cms: 'wordpress', permissions: ['create_post', 'upload_media'] }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_topics',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        categories: ['Product', 'AI', 'Operations', 'Engineering'],
        tags: ['ai staff', 'agents', 'workflows', 'automation', 'security'],
      },
      null,
      2
    ),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_recent',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        posts: [
          { title: 'How we use AI staff to ship faster', status: 'published' },
          { title: 'Security & approvals: staying in control', status: 'published' },
        ],
      },
      null,
      2
    ),
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    content: 'Great — I see existing content around AI staff + security, so I’ll keep this post practical and avoid repeating.\n\nNext: I’ll draft a crisp outline and then write the first draft.',
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    toolCalls: [
      { id: 'tc_wp_outline', type: 'function', function: { name: 'create_outline', arguments: '{ "topic": "AI staff: what it is and how teams use it", "sections": 6, "targetWords": 1200 }' } },
      { id: 'tc_wp_seo', type: 'function', function: { name: 'generate_seo', arguments: '{ "keyword": "AI staff", "audience": "B2B ops + engineering" }' } },
    ],
    content: 'Drafting outline + SEO…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_outline',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        outline: [
          'What “AI staff” means (vs. chatbots)',
          'The 3 core patterns: triage, delegation, automation',
          'How teams use it in week 1 (quick wins)',
          'Guardrails: approvals, audit trails, human-in-the-loop',
          'Examples: inbox, blog, research, ops',
          'How to get started (template + iterate)',
        ],
      },
      null,
      2
    ),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_seo',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        seoTitle: 'AI Staff: What It Is (and How Teams Use It)',
        metaDescription: 'Learn what “AI staff” means, the most common workflows teams automate first, and the guardrails that keep you in control.',
        primaryKeyword: 'ai staff',
      },
      null,
      2
    ),
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    content: 'Outline + SEO are ready. Next I’ll write the draft, generate a featured-image prompt, and save it as a draft post in WordPress.',
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    toolCalls: [
      {
        id: 'tc_wp_draft',
        type: 'function',
        function: { name: 'draft_post', arguments: '{ "title": "AI Staff: What It Is (and How Teams Use It)", "outlineRef": "tc_wp_outline", "targetWords": 1200, "tone": "clear, practical" }' },
      },
      {
        id: 'tc_wp_image_prompt',
        type: 'function',
        function: { name: 'create_featured_image_prompt', arguments: '{ "style": "modern, dark, minimal", "subject": "AI staff collaborating with humans", "size": "1200x630" }' },
      },
      {
        id: 'tc_wp_create_post',
        type: 'function',
        function: { name: 'create_post', arguments: '{ "status": "draft", "category": "AI", "tags": ["ai staff","agents","workflows"], "includeMeta": true }' },
      },
    ],
    content: 'Writing + saving draft…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_draft',
    noStream: true,
    content: JSON.stringify({ status: 'ok', words: 1235, readingTimeMin: 6, includes: ['examples', 'guardrails', 'getting started'] }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_image_prompt',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        prompt:
          'Dark, minimal hero illustration of a small AI crew (three stylized assistants) collaborating with a human at a desk, subtle starship UI overlays, high contrast, clean lines, 1200x630.',
      },
      null,
      2
    ),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_wp_create_post',
    noStream: true,
    content: JSON.stringify({ status: 'ok', postId: 1042, statusAfter: 'draft', title: 'AI Staff: What It Is (and How Teams Use It)', url: 'https://starships.ai/blog/?p=1042' }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Saga',
    content:
      '✅ Draft blog post ready\n\n- Title: **AI Staff: What It Is (and How Teams Use It)**\n- Length: **1,235 words** (~6 min)\n- SEO: title + meta description included\n- Featured image: prompt generated\n- Status: **Draft** (not published)\n\nWant me to add an **FAQ section** or tailor examples more toward **Ops** or **Engineering**?',
  },
]

const IRIS_TIMELINE: Step[] = [
  {
    role: 'user',
    content:
      'Iris — triage my Gmail inbox.\n\nGoals:\n- Find emails that need a reply\n- Label by topic (sales, support, bills)\n- Archive newsletters and promos\n- Draft replies for the top 3\n- Show progress step-by-step',
  },
  {
    role: 'assistant',
    agentName: 'Iris',
    toolCalls: [
      {
        id: 'tc_ir_labels',
        type: 'function',
        function: {
          name: 'ensure_labels',
          arguments: '{ "labels": ["Sales","Support","Bills","Newsletter"] }',
        },
      },
      { id: 'tc_ir_unread', type: 'function', function: { name: 'list_unread', arguments: '{ "limit": 80, "include": ["inbox","important"] }' } },
      { id: 'tc_ir_needs_reply', type: 'function', function: { name: 'find_needs_reply', arguments: '{ "threads": "unread", "signals": ["question","request","follow up"], "limit": 25 }' } },
    ],
    content:
      'Absolutely. I’ll do this like a real inbox workflow:\n\n1) Pull your current unread inbox\n2) Identify what needs a reply vs. can be filed\n3) Label by topic (Sales / Support / Bills / Newsletter)\n4) Archive newsletters + promos\n5) Draft replies for the top 3 (you review/send)',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_labels',
    noStream: true,
    content: JSON.stringify({ status: 'ok', created: 2, existing: 2, labels: ['Sales', 'Support', 'Bills', 'Newsletter'] }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_unread',
    noStream: true,
    content: JSON.stringify({ status: 'ok', unreadInInbox: 63, important: 9, timeWindowDays: 14 }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_needs_reply',
    noStream: true,
    content: JSON.stringify({ status: 'ok', needsReply: 14, topSenders: ['Acme Procurement', 'Jane (Support)', 'Stripe'] }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Iris',
    content: 'Got it. Next I’ll label threads by topic, archive newsletters/promos, and draft replies for the top 3 (so you can review).',
  },
  {
    role: 'assistant',
    agentName: 'Iris',
    toolCalls: [
      {
        id: 'tc_ir_classify',
        type: 'function',
        function: { name: 'classify_threads', arguments: '{ "threads": "unread", "labels": ["Sales","Support","Bills","Newsletter"], "max": 63 }' },
      },
      {
        id: 'tc_ir_archive_newsletters',
        type: 'function',
        function: {
          name: 'archive_by_label',
          arguments: '{ "label": "Newsletter", "olderThanDays": 7, "max": 40 }',
        },
      },
      {
        id: 'tc_ir_archive_promos',
        type: 'function',
        function: { name: 'archive_promotions', arguments: '{ "signals": ["promo","sale","unsubscribe"], "max": 30 }' },
      },
    ],
    content: 'Classifying + filing…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_classify',
    noStream: true,
    content: JSON.stringify({ status: 'ok', labeled: { Sales: 8, Support: 10, Bills: 6, Newsletter: 24, Other: 15 } }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_archive_newsletters',
    noStream: true,
    content: JSON.stringify({ status: 'ok', archived: 19, kept: 5, label: 'Newsletter' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_archive_promos',
    noStream: true,
    content: JSON.stringify({ status: 'ok', archived: 11, notes: 'Detected promo/unsubscribe patterns' }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Iris',
    content: 'Inbox is cleaner now. Next: draft replies for the top 3 priority threads (you’ll review before sending).',
  },
  {
    role: 'assistant',
    agentName: 'Iris',
    toolCalls: [
      {
        id: 'tc_ir_pick_top3',
        type: 'function',
        function: {
          name: 'select_top_threads',
          arguments: '{ "from": "needs_reply", "count": 3, "rules": ["important first","older first","direct questions"] }',
        },
      },
      { id: 'tc_ir_draft_1', type: 'function', function: { name: 'draft_reply', arguments: '{ "threadId": "t_sales_01", "tone": "crisp", "goal": "schedule_call" }' } },
      { id: 'tc_ir_draft_2', type: 'function', function: { name: 'draft_reply', arguments: '{ "threadId": "t_support_02", "tone": "helpful", "goal": "unblock_user" }' } },
      { id: 'tc_ir_draft_3', type: 'function', function: { name: 'draft_reply', arguments: '{ "threadId": "t_bills_03", "tone": "neutral", "goal": "confirm_receipt" }' } },
    ],
    content: 'Preparing drafts…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_pick_top3',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        threads: [
          { id: 't_sales_01', from: 'Acme Procurement', subject: 'Quick questions before we buy' },
          { id: 't_support_02', from: 'Jane', subject: 'Login failing for 2 users' },
          { id: 't_bills_03', from: 'Stripe', subject: 'Invoice available' },
        ],
      },
      null,
      2
    ),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_draft_1',
    noStream: true,
    content: JSON.stringify(
      { status: 'ok', threadId: 't_sales_01', draftId: 'd_001', preview: 'Happy to help — can you share your timeline and team size? If it helps, we can hop on a 15‑min call this week.' },
      null,
      2
    ),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_draft_2',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        threadId: 't_support_02',
        draftId: 'd_002',
        preview: 'Thanks — I can help. Can you confirm the error message + whether SSO is enabled? In the meantime, try resetting the session…',
      },
      null,
      2
    ),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_ir_draft_3',
    noStream: true,
    content: JSON.stringify(
      { status: 'ok', threadId: 't_bills_03', draftId: 'd_003', preview: 'Received — thank you. Please confirm the billing period and I’ll get this filed with our receipts.' },
      null,
      2
    ),
  },
  {
    role: 'assistant',
    agentName: 'Iris',
    content:
      '✅ Inbox triage complete\n\n- Unread in inbox: **63** (last 14 days)\n- Needs reply: **14**\n- Labeled: Sales / Support / Bills / Newsletter\n- Archived: **30** (newsletters + promos)\n- Drafted: **3 replies** (ready for your review)\n\nWant me to apply an **auto-label rule** for newsletters going forward, or keep it manual?',
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
    const iris = list.find(
      t =>
        t.slug === 'iris' ||
        t.name === 'Iris' ||
        String(t.slug ?? '')
          .toLowerCase()
          .startsWith('iris')
    )
    return iris?.avatarUrl
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
      content: target === 'iris' ? 'Sure, help me triage my inbox' : 'Sure, help me publish a blog post',
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
      content: target === 'iris' ? 'Perfect — I’ll spin up **Iris** and hand it the inbox triage.' : 'Perfect — I’ll spin up **Saga** and hand it the blog draft.',
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
      content: 'Running tools…',
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
                ? '{ "agent": "Iris", "task": "Triage my Gmail inbox", "conversationTitle": "Iris — Demo" }'
                : '{ "agent": "Saga", "task": "Publish a blog post as a draft in WordPress", "conversationTitle": "Saga — Demo" }',
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
          delegatedTo: target === 'iris' ? 'Iris' : 'Saga',
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
      content: target === 'iris' ? 'Done — switching you to **Iris**.' : 'Done — switching you to **Saga**.',
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
            content: 'Running tools…',
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
  const actorsLine = cfg.id === 'aria' ? `You, ${cfg.actorName}` : `${cfg.actorName}, You`
  const agentAvatarUrlOverride = cfg.id === 'aria' ? ariaAvatarUrl : cfg.id === 'iris' ? irisAvatarUrl : cfg.id === 'saga' ? sagaAvatarUrl : undefined
  const isResponding = (flagsByConvo[activeConvoId]?.responding ?? false) || (flagsByConvo[activeConvoId]?.awaitingTools ?? false)
  const isRunning = flagsByConvo[activeConvoId]?.isRunning ?? false
  const hasRun = flagsByConvo[activeConvoId]?.hasRun ?? false
  const hasAnyMessages = (messagesByConvo[activeConvoId] || []).length > 0
  const isAutoplayTab = activeConvoId === 'aria'
  const showDemoChooser = activeConvoId === 'aria' && flagsByConvo.aria.hasRun && !flagsByConvo.aria.isRunning && demoChoiceState.stage === 'choose' && (messagesByConvo.aria?.length || 0) > 0
  const isDemoCalling = activeConvoId === 'aria' && demoChoiceState.stage === 'calling'

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
                  <div className="text-sm font-medium leading-none truncate">{cfg.subtitle}</div>
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
                        <div className="flex flex-1 flex-col gap-2 items-end w-full">
                          <button
                            type="button"
                            onClick={() => handleDemoChoice('iris')}
                            className="w-full text-left bg-card text-card-foreground shadow-sm rounded-2xl rounded-br-md px-4 py-3 border border-border/50 hover:border-border/80 hover:bg-muted/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            aria-label="Sure, help me triage my inbox"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm leading-relaxed">Sure, help me triage my inbox</div>
                              <Icon name="caret-right" iconOverride={{ type: 'phosphor', component: 'CaretRight' }} weight="bold" className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDemoChoice('saga')}
                            className="w-full text-left bg-card text-card-foreground shadow-sm rounded-2xl rounded-br-md px-4 py-3 border border-border/50 hover:border-border/80 hover:bg-muted/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            aria-label="Sure, help me publish a blog post"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm leading-relaxed">Sure, help me publish a blog post</div>
                              <Icon name="caret-right" iconOverride={{ type: 'phosphor', component: 'CaretRight' }} weight="bold" className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </button>
                        </div>
                        <div className="flex-shrink-0 w-8 h-8 rounded-full ring-1 ring-border/40 bg-primary/10 mb-1 overflow-hidden flex items-center justify-center">
                          <Icon name="user" iconOverride={{ type: 'phosphor', component: 'User' }} weight="bold" size={16} className="text-primary" />
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
