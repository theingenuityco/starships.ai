'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ConversationMessageList } from '@/components/conversation/ConversationMessageList'
import AgentAvatar from '@/components/animated/AgentAvatar'
import Icon from '@/components/primitives/Icon'
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

type ConvoId = 'aria' | 'doc_organizer' | 'lead_generator'

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
  doc_organizer: {
    id: 'doc_organizer',
    label: 'Doc Organizer ↔ You',
    tabName: 'Doc Organizer',
    actorName: 'Doc Organizer',
    agentSeed: 'Doc Organizer',
    subtitle: 'Drive cleanup with visible tool progress',
  },
  lead_generator: {
    id: 'lead_generator',
    label: 'Lead Generator ↔ You',
    tabName: 'Lead Generator',
    actorName: 'Lead Generator',
    agentSeed: 'Lead Generator',
    subtitle: 'Lead-gen campaign setup in Ads Manager',
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

const DOC_ORGANIZER_TIMELINE: Step[] = [
  {
    role: 'user',
    content: 'Doc Organizer — clean up my Google Drive.\n\nGoals:\n- Find duplicate files\n- Move “Receipts” into a single folder\n- Archive old project docs (2022+)\n- Show progress step-by-step',
  },
  {
    role: 'assistant',
    agentName: 'Doc Organizer',
    toolCalls: [
      { id: 'tc_do_scan', type: 'function', function: { name: 'scan', arguments: '{ "scope": "my-drive", "maxFiles": 5000 }' } },
      { id: 'tc_do_classify', type: 'function', function: { name: 'classify_folders', arguments: '{ "signals": ["receipts","projects","invoices","contracts"] }' } },
      { id: 'tc_do_large', type: 'function', function: { name: 'list_large_files', arguments: '{ "minMb": 100, "limit": 20 }' } },
    ],
    content:
      'On it. I’ll do this in phases:\n\n1) Index + classify your drive\n2) Duplicates + large-file hotspots\n3) Consolidate receipts (dry run → apply)\n4) Archive older project docs\n5) Prepare a safe “review” folder for duplicates',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_scan',
    noStream: true,
    content: JSON.stringify({ status: 'ok', scanned: 4821, folders: 214, notes: 'Index built for fast matching' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_classify',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        classifiedFolders: 214,
        buckets: { receipts: 9, projects: 41, invoices: 6, contracts: 4, other: 154 },
        notes: 'Using folder names + file patterns',
      },
      null,
      2
    ),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_large',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        largeFiles: 20,
        top: [
          { name: 'Raw_footage_export.mov', sizeMb: 1840 },
          { name: 'Final_presentation_2022.pptx', sizeMb: 312 },
          { name: 'Design_assets.zip', sizeMb: 266 },
        ],
      },
      null,
      2
    ),
  },
  {
    role: 'assistant',
    agentName: 'Doc Organizer',
    content:
      'Index built. I also found a few **large-file hotspots** that typically drive storage bloat.\n\nNext: duplicates detection + receipts consolidation (I’ll do a dry run first so it’s safe).',
  },
  {
    role: 'assistant',
    agentName: 'Doc Organizer',
    toolCalls: [
      { id: 'tc_do_dupes', type: 'function', function: { name: 'find_duplicates', arguments: '{ "match": ["hash","name","size"], "scope": "my-drive" }' } },
      { id: 'tc_do_receipts_detect', type: 'function', function: { name: 'find_receipts', arguments: '{ "signals": ["receipt","vendor","invoice"], "max": 300 }' } },
      { id: 'tc_do_receipts_folder', type: 'function', function: { name: 'ensure_folder', arguments: '{ "path": "Personal/Receipts" }' } },
    ],
    content: 'Running duplicates + identifying receipt candidates…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_dupes',
    noStream: true,
    content: JSON.stringify({ status: 'ok', duplicateSets: 37, candidates: 112, largestSet: 9, heuristic: 'hash+name+size', next: 'Prepare review folder + keep-newest suggestions' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_receipts_detect',
    noStream: true,
    content: JSON.stringify(
      {
        status: 'ok',
        receiptCandidates: 158,
        sources: ['Gmail exports', 'scans', 'PDF invoices'],
        ambiguity: 12,
      },
      null,
      2
    ),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_receipts_folder',
    noStream: true,
    content: JSON.stringify({ status: 'ok', folder: 'Personal/Receipts', created: true }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Doc Organizer',
    content: 'Found **37 duplicate sets** (112 files) and **158 receipt candidates**.\n\nNext I’ll consolidate receipts, then archive older project docs.',
  },
  {
    role: 'assistant',
    agentName: 'Doc Organizer',
    toolCalls: [
      { id: 'tc_do_receipts_apply', type: 'function', function: { name: 'apply_moves', arguments: '{ "query": "receipt_candidates", "count": 158, "targetPath": "Personal/Receipts" }' } },
      { id: 'tc_do_receipts_verify', type: 'function', function: { name: 'verify_moves', arguments: '{ "targetPath": "Personal/Receipts", "expectedMin": 120 }' } },
    ],
    content: 'Receipts consolidation: apply → verify…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_receipts_apply',
    noStream: true,
    content: JSON.stringify({ status: 'ok', moved: 146, skipped: 12, destination: 'Personal/Receipts' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_receipts_verify',
    noStream: true,
    content: JSON.stringify({ status: 'ok', verified: true, inFolder: 146, spotChecks: 12 }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Doc Organizer',
    content: 'Receipts consolidated and verified. Next: archive older project docs (pre-2023) and create a “Review/Duplicates” holding area.',
  },
  {
    role: 'assistant',
    agentName: 'Doc Organizer',
    toolCalls: [
      { id: 'tc_do_archive_apply', type: 'function', function: { name: 'archive_old', arguments: '{ "before": "2023-01-01", "targetPath": "Archive/Projects (pre-2023)" }' } },
      { id: 'tc_do_review_folder', type: 'function', function: { name: 'ensure_folder', arguments: '{ "path": "Review/Duplicates" }' } },
      { id: 'tc_do_dupes_review', type: 'function', function: { name: 'move_duplicates_to_review', arguments: '{ "strategy": "keep_newest_keep_in_place", "reviewPath": "Review/Duplicates" }' } },
      { id: 'tc_do_report', type: 'function', function: { name: 'generate_cleanup_report', arguments: '{ "format": "summary+csv", "include": ["receipts","archive","duplicates"] }' } },
    ],
    content: 'Archiving + preparing duplicates review folder…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_archive_apply',
    noStream: true,
    content: JSON.stringify({ status: 'ok', archived: 318, destination: 'Archive/Projects (pre-2023)' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_review_folder',
    noStream: true,
    content: JSON.stringify({ status: 'ok', folder: 'Review/Duplicates', created: true }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_dupes_review',
    noStream: true,
    content: JSON.stringify({ status: 'ok', movedToReview: 74, leftInPlace: 38, rule: 'keep newest by modified date' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_do_report',
    noStream: true,
    content: JSON.stringify({ status: 'ok', report: { path: 'Reports/drive-cleanup-summary.pdf', attachments: ['drive-cleanup.csv'] } }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Doc Organizer',
    content:
      '✅ Cleanup complete\n\n- Indexed + classified: **4,821 files**\n- Consolidated receipts: **146 moved** (verified)\n- Archived older project docs: **318 moved**\n- Duplicates: **112 files** detected → **74 moved** to `Review/Duplicates` (kept newest in place)\n- Report: `Reports/drive-cleanup-summary.pdf`\n\nWant me to generate a **safe-delete list** for the duplicates in Review, or keep them as-is?',
  },
]

const LEAD_GENERATOR_TIMELINE: Step[] = [
  {
    role: 'user',
    content:
      'Lead Generator — set up a lead-gen campaign in Ads Manager for our product.\n\nTarget:\n- B2B teams (Ops + Engineering)\n- Goal: capture qualified leads (demo requests)\n- Placements: feed + stories\n- Show progress step-by-step',
  },
  {
    role: 'assistant',
    agentName: 'Lead Generator',
    toolCalls: [
      { id: 'tc_lg_account', type: 'function', function: { name: 'get_account', arguments: '{ "currency": "USD", "timezone": "America/Los_Angeles" }' } },
      { id: 'tc_lg_objective', type: 'function', function: { name: 'recommend_objective', arguments: '{ "goal": "demo_requests", "options": ["LEAD_GENERATION","CONVERSIONS","TRAFFIC"] }' } },
      {
        id: 'tc_lg_audience_est',
        type: 'function',
        function: {
          name: 'estimate_audience',
          arguments: '{ "locations": ["US","CA","UK"], "jobTitles": ["RevOps","Engineering Manager","Platform"], "companySize": "50-500", "placements": ["feed","stories"] }',
        },
      },
    ],
    content:
      'Absolutely. I’ll set this up like a real Ads Manager workflow:\n\n1) Confirm objective + audience size\n2) Create campaign + ad set (budget, schedule, placements)\n3) Build a lead form (qualifying questions + consent)\n4) Generate creatives + ads (A/B variants) + preview\n5) Add tracking + publish a draft for approval',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_account',
    noStream: true,
    content: JSON.stringify({ status: 'ok', accountId: 'act_demo_01', currency: 'USD', timezone: 'America/Los_Angeles' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_objective',
    noStream: true,
    content: JSON.stringify({ status: 'ok', recommended: 'LEAD_GENERATION', notes: 'Qualify leads on-platform; route to sales/CRM via webhook' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_audience_est',
    noStream: true,
    content: JSON.stringify({ status: 'ok', audienceEstimate: { low: 18000, high: 42000 }, placements: ['feed', 'stories'] }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Lead Generator',
    content: 'Audience size looks healthy for testing. Next I’ll create the campaign + ad set (paused), then build the lead form and creatives.',
  },
  {
    role: 'assistant',
    agentName: 'Lead Generator',
    toolCalls: [
      {
        id: 'tc_lg_campaign',
        type: 'function',
        function: { name: 'create_campaign', arguments: '{ "accountId": "act_demo_01", "name": "Starships — Lead Gen", "objective": "LEAD_GENERATION", "status": "PAUSED" }' },
      },
      {
        id: 'tc_lg_adset',
        type: 'function',
        function: {
          name: 'create_ad_set',
          arguments:
            '{ "campaignId": "cmp_demo_019", "name": "Ops+Eng (50-500) — US/CA/UK", "dailyBudget": 120, "bidStrategy": "LOWEST_COST", "placements": ["feed","stories"], "optimizationGoal": "LEADS", "status": "PAUSED" }',
        },
      },
      {
        id: 'tc_lg_targeting',
        type: 'function',
        function: {
          name: 'set_targeting',
          arguments: '{ "adSetId": "adset_demo_044", "locations": ["US","CA","UK"], "jobTitles": ["RevOps","Engineering Manager","Platform"], "companySize": "50-500" }',
        },
      },
    ],
    content: 'Campaign + ad set setup (budget, schedule, placements, targeting)…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_campaign',
    noStream: true,
    content: JSON.stringify({ status: 'ok', campaignId: 'cmp_demo_019', objective: 'LEAD_GENERATION', statusAfter: 'PAUSED' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_adset',
    noStream: true,
    content: JSON.stringify({ status: 'ok', adSetId: 'adset_demo_044', dailyBudget: 120, placements: ['feed', 'stories'], statusAfter: 'PAUSED' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_targeting',
    noStream: true,
    content: JSON.stringify({ status: 'ok', targetingApplied: true, audienceEstimate: { low: 18000, high: 42000 } }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Lead Generator',
    content: 'Campaign and ad set are created (paused). Next I’ll build the lead form (qualifying questions + consent) and generate A/B creative.',
  },
  {
    role: 'assistant',
    agentName: 'Lead Generator',
    toolCalls: [
      {
        id: 'tc_lg_form',
        type: 'function',
        function: {
          name: 'create_lead_form',
          arguments:
            '{ "name": "Request a demo", "policyUrl": "https://example.com/privacy", "questions": ["Work email","Company","Role","Primary use case"], "thankYou": { "headline": "Thanks — we’ll reach out", "ctaUrl": "https://starships.ai" } }',
        },
      },
      { id: 'tc_lg_copy_a', type: 'function', function: { name: 'generate_ad_copy', arguments: '{ "variant": "A", "angle": "delegation_visibility", "cta": "Request demo" }' } },
      { id: 'tc_lg_copy_b', type: 'function', function: { name: 'generate_ad_copy', arguments: '{ "variant": "B", "angle": "replace_manual_ops", "cta": "Request demo" }' } },
      { id: 'tc_lg_assets', type: 'function', function: { name: 'upload_assets', arguments: '{ "assets": ["square_image","story_image"], "theme": "dark", "style": "product_ui" }' } },
    ],
    content: 'Lead form + A/B copy + creative assets…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_form',
    noStream: true,
    content: JSON.stringify({ status: 'ok', formId: 'form_demo_007', questions: 4, formStatus: 'DRAFT' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_copy_a',
    noStream: true,
    content: JSON.stringify({ status: 'ok', variant: 'A', primaryText: 'Delegate ops work to AI staff — see tools + results in real time.', headline: 'Request a demo', cta: 'Request demo' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_copy_b',
    noStream: true,
    content: JSON.stringify({ status: 'ok', variant: 'B', primaryText: 'Replace manual handoffs with AI staff (with approvals).', headline: 'Get demo requests', cta: 'Request demo' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_assets',
    noStream: true,
    content: JSON.stringify({ status: 'ok', assetsUploaded: 2, assetIds: ['asset_img_sq_11', 'asset_img_story_22'] }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Lead Generator',
    toolCalls: [
      {
        id: 'tc_lg_creative_a',
        type: 'function',
        function: { name: 'create_creative', arguments: '{ "adSetId": "adset_demo_044", "assetId": "asset_img_sq_11", "copyVariant": "A", "formId": "form_demo_007" }' },
      },
      {
        id: 'tc_lg_creative_b',
        type: 'function',
        function: { name: 'create_creative', arguments: '{ "adSetId": "adset_demo_044", "assetId": "asset_img_story_22", "copyVariant": "B", "formId": "form_demo_007" }' },
      },
      { id: 'tc_lg_ad_a', type: 'function', function: { name: 'create_ad', arguments: '{ "adSetId": "adset_demo_044", "creativeId": "creative_demo_A1", "name": "Variant A", "status": "PAUSED" }' } },
      { id: 'tc_lg_ad_b', type: 'function', function: { name: 'create_ad', arguments: '{ "adSetId": "adset_demo_044", "creativeId": "creative_demo_B1", "name": "Variant B", "status": "PAUSED" }' } },
      {
        id: 'tc_lg_tracking',
        type: 'function',
        function: { name: 'setup_tracking', arguments: '{ "campaignId": "cmp_demo_019", "utm": true, "leadWebhook": true, "fields": ["variant","placement","creative"] }' },
      },
      { id: 'tc_lg_preview', type: 'function', function: { name: 'preview_ads', arguments: '{ "adIds": ["ad_demo_A1","ad_demo_B1"], "placements": ["feed","stories"] }' } },
      {
        id: 'tc_lg_publish',
        type: 'function',
        function: { name: 'publish_draft', arguments: '{ "campaignId": "cmp_demo_019", "adSetId": "adset_demo_044", "adIds": ["ad_demo_A1","ad_demo_B1"], "approvalRequired": true }' },
      },
    ],
    content: 'Creating ads + wiring tracking + generating previews + publishing draft…',
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_creative_a',
    noStream: true,
    content: JSON.stringify({ status: 'ok', creativeId: 'creative_demo_A1', variant: 'A', formId: 'form_demo_007' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_creative_b',
    noStream: true,
    content: JSON.stringify({ status: 'ok', creativeId: 'creative_demo_B1', variant: 'B', formId: 'form_demo_007' }, null, 2),
  },
  { role: 'tool', messageType: 'tool_result', toolCallId: 'tc_lg_ad_a', noStream: true, content: JSON.stringify({ status: 'ok', adId: 'ad_demo_A1', statusAfter: 'PAUSED' }, null, 2) },
  { role: 'tool', messageType: 'tool_result', toolCallId: 'tc_lg_ad_b', noStream: true, content: JSON.stringify({ status: 'ok', adId: 'ad_demo_B1', statusAfter: 'PAUSED' }, null, 2) },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_tracking',
    noStream: true,
    content: JSON.stringify({ status: 'ok', utmTemplate: 'utm_campaign=leadgen&utm_source=ads_manager&utm_content={variant}', leadWebhook: true }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_preview',
    noStream: true,
    content: JSON.stringify({ status: 'ok', previews: 4, notes: 'Generated feed+stories previews for both variants' }, null, 2),
  },
  {
    role: 'tool',
    messageType: 'tool_result',
    toolCallId: 'tc_lg_publish',
    noStream: true,
    content: JSON.stringify({ status: 'ok', draftCampaignId: 'cmp_demo_019', statusAfter: 'PAUSED', approvalRequired: true, variants: ['A', 'B'] }, null, 2),
  },
  {
    role: 'assistant',
    agentName: 'Lead Generator',
    content:
      '✅ Draft lead campaign ready for approval\n\n- Objective: **Lead Generation**\n- Placements: **feed + stories**\n- Budget: **$120/day** (paused)\n- Lead form: **4 questions** (draft)\n- Ads: **Variant A/B** (paused) + previews generated\n- Tracking: UTMs + lead webhook\n- Safety: **approval required** before publishing\n\nWant the offer to be a **2‑minute walkthrough** or a **15‑minute demo**?',
  },
]

function useConvoTimelines() {
  return useMemo<Record<ConvoId, Step[]>>(
    () => ({
      aria: ARIA_TIMELINE,
      doc_organizer: DOC_ORGANIZER_TIMELINE,
      lead_generator: LEAD_GENERATOR_TIMELINE,
    }),
    []
  )
}

export default function HeroConversationDemo() {
  const { data: ariaTemplates = [] } = useAgentTemplates({ search: 'aria' })
  const ariaAvatarUrl = useMemo(() => {
    const aria = ariaTemplates.find(t => t.slug === 'aria' || t.name === 'Aria')
    return aria?.avatarUrl
  }, [ariaTemplates])

  const timelines = useConvoTimelines()
  const [activeConvoId, setActiveConvoId] = useState<ConvoId>('aria')
  const [messagesByConvo, setMessagesByConvo] = useState<Record<ConvoId, DemoMessage[]>>({ aria: [], doc_organizer: [], lead_generator: [] })
  const [respondingByConvo, setRespondingByConvo] = useState<Record<ConvoId, boolean>>({ aria: false, doc_organizer: false, lead_generator: false })
  const [awaitingToolsByConvo, setAwaitingToolsByConvo] = useState<Record<ConvoId, boolean>>({ aria: false, doc_organizer: false, lead_generator: false })
  const [isRunningByConvo, setIsRunningByConvo] = useState<Record<ConvoId, boolean>>({ aria: false, doc_organizer: false, lead_generator: false })
  const [hasRunByConvo, setHasRunByConvo] = useState<Record<ConvoId, boolean>>({ aria: false, doc_organizer: false, lead_generator: false })
  const runSeqRef = useState(() => ({ aria: 0, doc_organizer: 0, lead_generator: 0 }))[0]
  const demoChooserClockRef = useRef<number>(Date.now())
  const [demoChoiceState, setDemoChoiceState] = useState<{ stage: 'choose' | 'calling' | 'done'; selected: ConvoId | null }>({
    stage: 'choose',
    selected: null,
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  if (!abortControllerRef.current) abortControllerRef.current = new AbortController()
  const sleepCtlRef = useRef<ReturnType<typeof createAbortableSleep> | null>(null)
  if (!sleepCtlRef.current) sleepCtlRef.current = createAbortableSleep(abortControllerRef.current.signal)
  const sleep = sleepCtlRef.current.sleep
  const signal = abortControllerRef.current.signal

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      sleepCtlRef.current?.clearAll()
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
      content: target === 'doc_organizer' ? 'Sure, help me organize my drive' : 'Sure, help me run an ad campaign',
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
      content: target === 'doc_organizer' ? 'Perfect — I’ll spin up **Doc Organizer** and hand it the task.' : 'Perfect — I’ll spin up **Lead Generator** and hand it the campaign setup.',
      createdAt: a1CreatedAt,
      updatedAt: a1CreatedAt,
      messageType: 'agent_response',
      streaming: false,
    })

    await sleep(350)
    if (signal.aborted) return

    // Tool runner: call-agent
    const toolCallId = target === 'doc_organizer' ? 'tc_demo_call_doc_organizer' : 'tc_demo_call_lead_generator'
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
              target === 'doc_organizer'
                ? '{ "agent": "Doc Organizer", "task": "Clean up my Google Drive", "conversationTitle": "Doc Organizer — Demo" }'
                : '{ "agent": "Lead Generator", "task": "Set up a lead-gen campaign in Ads Manager", "conversationTitle": "Lead Generator — Demo" }',
          },
        },
      ],
    })
    setAwaitingToolsByConvo(prev => ({ ...prev, aria: true }))

    await sleep(520)
    if (signal.aborted) return

    const toolResultAt = nextDemoChooserIso()
    appendDemoChooserMessage(convoId, {
      id: `demo-${convoId}-tr-${toolResultAt}`,
      role: 'tool',
      content: JSON.stringify(
        {
          status: 'ok',
          delegatedTo: target === 'doc_organizer' ? 'Doc Organizer' : 'Lead Generator',
          conversation: {
            id: target === 'doc_organizer' ? 'c_demo_doc_organizer' : 'c_demo_lead_generator',
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
    setAwaitingToolsByConvo(prev => ({ ...prev, aria: false }))

    await sleep(350)
    if (signal.aborted) return

    const a2CreatedAt = nextDemoChooserIso()
    appendDemoChooserMessage(convoId, {
      id: `demo-${convoId}-a-switch-${a2CreatedAt}`,
      role: 'assistant',
      agentName: 'Aria',
      content: target === 'doc_organizer' ? 'Done — switching you to **Doc Organizer**.' : 'Done — switching you to **Lead Generator**.',
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
    if (isRunningByConvo[convoId]) return
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

    setIsRunningByConvo(prev => ({ ...prev, [convoId]: true }))
    setHasRunByConvo(prev => ({ ...prev, [convoId]: true }))

    try {
      const timeline = timelines[convoId] || []
      setMessagesByConvo(prev => ({ ...prev, [convoId]: [] }))
      setRespondingByConvo(prev => ({ ...prev, [convoId]: false }))
      setAwaitingToolsByConvo(prev => ({ ...prev, [convoId]: false }))

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
          setAwaitingToolsByConvo(prev => ({ ...prev, [convoId]: pendingToolIds.size > 0 }))
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
        setRespondingByConvo(prev => ({ ...prev, [convoId]: true }))

        if (!step.noStream) {
          const parts = chunkTextForStreaming(step.content)
          let position = 0
          let chunks: DemoStreamChunk[] = []
          for (const part of parts) {
            if (runSeqRef[convoId] !== runSeq) return
            if (signal.aborted) return
            chunks = [...chunks, { content: part, position, timestamp: nextTs() }]
            position += 1
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
        setRespondingByConvo(prev => ({ ...prev, [convoId]: false }))

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
          setAwaitingToolsByConvo(prev => ({ ...prev, [convoId]: ids.length > 0 }))
          await sleep(250)
          if (signal.aborted) return
        } else {
          await sleep(900)
          if (signal.aborted) return
        }
      }
    } finally {
      setRespondingByConvo(prev => ({ ...prev, [convoId]: false }))
      setAwaitingToolsByConvo(prev => ({ ...prev, [convoId]: false }))
      setIsRunningByConvo(prev => ({ ...prev, [convoId]: false }))
    }
  }

  const cfg = CONVOS[activeConvoId]
  const actorsLine = cfg.id === 'aria' ? `You, ${cfg.actorName}` : `${cfg.actorName}, You`
  const isResponding = respondingByConvo[activeConvoId] || false || awaitingToolsByConvo[activeConvoId] || false
  const isRunning = isRunningByConvo[activeConvoId] || false
  const hasRun = hasRunByConvo[activeConvoId] || false
  const hasAnyMessages = (messagesByConvo[activeConvoId] || []).length > 0
  const isAutoplayTab = activeConvoId === 'aria'
  const showDemoChooser = activeConvoId === 'aria' && hasRunByConvo.aria && !isRunningByConvo.aria && demoChoiceState.stage === 'choose' && (messagesByConvo.aria?.length || 0) > 0
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
                agentAvatarUrlOverride={cfg.id === 'aria' ? ariaAvatarUrl : undefined}
                isRespondingOverride={isResponding}
                isAssistantStreamingOverride={respondingByConvo[activeConvoId] || false}
                isAwaitingToolResultsOverride={awaitingToolsByConvo[activeConvoId] || false}
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
                            onClick={() => handleDemoChoice('doc_organizer')}
                            className="w-full text-left bg-card text-card-foreground shadow-sm rounded-2xl rounded-br-md px-4 py-3 border border-border/50 hover:border-border/80 hover:bg-muted/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            aria-label="Sure, help me organize my drive"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm leading-relaxed">Sure, help me organize my drive</div>
                              <Icon name="caret-right" iconOverride={{ type: 'phosphor', component: 'CaretRight' }} weight="bold" className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDemoChoice('lead_generator')}
                            className="w-full text-left bg-card text-card-foreground shadow-sm rounded-2xl rounded-br-md px-4 py-3 border border-border/50 hover:border-border/80 hover:bg-muted/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            aria-label="Sure, help me run an ad campaign"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm leading-relaxed">Sure, help me run an ad campaign</div>
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
