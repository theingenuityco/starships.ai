import type { Blueprint } from '@starships/autopilot'

export interface PopularBlueprintExample {
  key: string
  name: string
  description: string
  blueprint: Blueprint
}

export const POPULAR_BLUEPRINTS: PopularBlueprintExample[] = [
  {
    key: 'rag_search_chat',
    name: 'RAG Search & Chat',
    description: 'Retrieve, ground, and answer with sources.',
    blueprint: {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
        { ref: 'user', type: 'user_prompt', name: 'User Query', description: 'Capture the user question', parameters: {} },
        { ref: 'llm_understand', type: 'llm', name: 'Understand Query', description: 'Extract intents and keywords', parameters: {} },
        { ref: 'search', type: 'http_request', name: 'Vector Search', description: 'Search embeddings index', parameters: {} },
        { ref: 'transform_topk', type: 'transform', name: 'Select Top‑k', description: 'Pick top matches', parameters: {} },
        { ref: 'llm_answer', type: 'llm', name: 'Answer with Citations', description: 'Grounded response using retrieved chunks', parameters: {} },
        { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} },
      ],
      edges: [
        { ref: 'e1', from: 'start', to: 'user' },
        { ref: 'e2', from: 'user', to: 'llm_understand' },
        { ref: 'e3', from: 'llm_understand', to: 'search' },
        { ref: 'e4', from: 'search', to: 'transform_topk' },
        { ref: 'e5', from: 'transform_topk', to: 'llm_answer' },
        { ref: 'e6', from: 'llm_answer', to: 'end' },
      ],
      metadata: {},
    },
  },
  {
    key: 'support_ticket_triage',
    name: 'Support Ticket Triage',
    description: 'Classify and route tickets with automated actions.',
    blueprint: {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
        { ref: 'prompt', type: 'user_prompt', name: 'Incoming Ticket', description: 'User-submitted issue', parameters: {} },
        { ref: 'classify', type: 'llm', name: 'Classify Intent', description: 'Identify category and urgency', parameters: {} },
        { ref: 'route', type: 'conditional', name: 'Routing', description: 'Decide next action', parameters: {} },
        { ref: 'jira', type: 'tool', name: 'Create Jira', description: 'Create engineering ticket', parameters: {} },
        { ref: 'support', type: 'http_request', name: 'Notify Support', description: 'Send to support queue', parameters: {} },
        { ref: 'reply', type: 'llm', name: 'Draft Reply', description: 'Compose acknowledgement/next steps', parameters: {} },
        { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} },
      ],
      edges: [
        { ref: 'e1', from: 'start', to: 'prompt' },
        { ref: 'e2', from: 'prompt', to: 'classify' },
        { ref: 'e3', from: 'classify', to: 'route' },
        { ref: 'e4', from: 'route', to: 'jira', condition: 'bug' },
        { ref: 'e5', from: 'route', to: 'support', condition: 'billing|account' },
        { ref: 'e6', from: 'route', to: 'reply', condition: 'faq' },
        { ref: 'e7', from: 'jira', to: 'reply' },
        { ref: 'e8', from: 'support', to: 'reply' },
        { ref: 'e9', from: 'reply', to: 'end' },
      ],
      metadata: {},
    },
  },
  {
    key: 'lead_enrichment',
    name: 'Lead Enrichment',
    description: 'Enrich and upsert leads into your CRM.',
    blueprint: {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
        { ref: 'prompt', type: 'user_prompt', name: 'Lead Input', description: 'Email/domain', parameters: {} },
        { ref: 'enrich', type: 'http_request', name: '3rd‑party Enrichment', description: 'Enrich person/company', parameters: {} },
        { ref: 'normalize', type: 'transform', name: 'Normalize Fields', description: 'Map to CRM schema', parameters: {} },
        { ref: 'crm', type: 'tool', name: 'CRM Upsert', description: 'Create or update lead', parameters: {} },
        { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} },
      ],
      edges: [
        { ref: 'e1', from: 'start', to: 'prompt' },
        { ref: 'e2', from: 'prompt', to: 'enrich' },
        { ref: 'e3', from: 'enrich', to: 'normalize' },
        { ref: 'e4', from: 'normalize', to: 'crm' },
        { ref: 'e5', from: 'crm', to: 'end' },
      ],
      metadata: {},
    },
  },
  {
    key: 'content_moderation',
    name: 'Content Moderation',
    description: 'Screen user content and explain flags.',
    blueprint: {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
        { ref: 'content', type: 'user_prompt', name: 'User Content', description: 'Submitted text', parameters: {} },
        { ref: 'moderate', type: 'http_request', name: 'Moderation API', description: 'Policy check', parameters: {} },
        { ref: 'branch', type: 'conditional', name: 'Is Safe?', description: 'Decide allow or flag', parameters: {} },
        { ref: 'explain', type: 'llm', name: 'Explain Flag', description: 'Generate rationale', parameters: {} },
        { ref: 'end_ok', type: 'end', name: 'Allow', description: '', parameters: {} },
        { ref: 'end_flag', type: 'end', name: 'Flagged', description: '', parameters: {} },
      ],
      edges: [
        { ref: 'e1', from: 'start', to: 'content' },
        { ref: 'e2', from: 'content', to: 'moderate' },
        { ref: 'e3', from: 'moderate', to: 'branch' },
        { ref: 'e4', from: 'branch', to: 'end_ok', condition: 'safe' },
        { ref: 'e5', from: 'branch', to: 'explain', condition: 'flag' },
        { ref: 'e6', from: 'explain', to: 'end_flag' },
      ],
      metadata: {},
    },
  },
  {
    key: 'api_orchestrator',
    name: 'API Orchestrator',
    description: 'Fan‑in multiple APIs and notify.',
    blueprint: {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
        { ref: 'fetch_user', type: 'http_request', name: 'Fetch User', description: 'User profile API', parameters: {} },
        { ref: 'fetch_usage', type: 'http_request', name: 'Fetch Usage', description: 'Usage metrics API', parameters: {} },
        { ref: 'merge', type: 'code', name: 'Merge Results', description: 'Combine responses', parameters: {} },
        { ref: 'notify', type: 'tool', name: 'Notify', description: 'Send notification', parameters: {} },
        { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} },
      ],
      edges: [
        { ref: 'e1', from: 'start', to: 'fetch_user' },
        { ref: 'e2', from: 'fetch_user', to: 'fetch_usage' },
        { ref: 'e3', from: 'fetch_usage', to: 'merge' },
        { ref: 'e4', from: 'merge', to: 'notify' },
        { ref: 'e5', from: 'notify', to: 'end' },
      ],
      metadata: {},
    },
  },
]

export default POPULAR_BLUEPRINTS


