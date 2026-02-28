/**
 * Piper Agent Template
 * Lead Manager - imported from production export.
 * Manages lead intake, qualification, enrichment, web research, pipeline updates, and compliant outreach.
 */

import * as fs from 'fs'
import * as path from 'path'

import type { AgentTemplateModel } from '@starships/protocol'
import type { Blueprint } from '@starships/autopilot'

// Load Piper export JSON (same format as ImportExportContainerV1<'agent'>)
// When running from dist/seeders/agents/, JSON lives in src/seeders/agents/; when running from src/ (tsx), it's alongside this file.
const isDist = __dirname.includes('/dist/') || __dirname.includes('\\dist\\')
const dir = isDist ? path.join(__dirname, '..', '..', '..', 'src', 'seeders', 'agents') : __dirname
const exportPath = path.join(dir, 'piper-export.json')
const raw = fs.readFileSync(exportPath, 'utf-8')
const container = JSON.parse(raw) as {
  payload?: { agent?: Record<string, unknown> }
}

const agent = container?.payload?.agent
if (!agent || typeof agent !== 'object') {
  throw new Error('Invalid Piper export: missing payload.agent')
}

const blueprint = agent.blueprint as Blueprint | undefined
if (!blueprint || typeof blueprint !== 'object') {
  throw new Error('Invalid Piper export: missing blueprint')
}

/**
 * Piper Agent Template - Lead Manager
 */
export const piperTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: String(agent.name ?? 'Piper'),
  slug: 'piper',
  role: String(agent.role ?? 'Lead Manager'),
  version: '1.0.0',
  description: String(
    agent.description ??
      'Manages lead intake, qualification, enrichment planning, light web research via Bright Data, Sheets pipeline updates, and compliant outreach.'
  ),
  category: (agent.category as AgentTemplateModel['category']) ?? 'general',

  model: String(agent.model ?? 'anthropic/claude-haiku-4.5'),
  temperature: Number(agent.temperature ?? 0.3),
  maxTokens: Number(agent.maxTokens ?? 60000),
  timeout: Number(agent.timeout ?? 600000),
  reasoning: agent.reasoning as AgentTemplateModel['reasoning'],

  systemPrompt: typeof agent.systemPrompt === 'string' ? agent.systemPrompt : '',
  state: (agent.state as AgentTemplateModel['state']) ?? { tools: [], messages: [] },
  blueprint,

  assignedToolSlugs: Array.isArray(agent.assignedToolSlugs)
    ? (agent.assignedToolSlugs as string[]).filter((s): s is string => typeof s === 'string')
    : [],

  icon: '📋',
  previewPrompts: Array.isArray(agent.previewPrompts)
    ? (agent.previewPrompts as string[]).filter((s): s is string => typeof s === 'string')
    : [
        'Fill this sheet in 3-row batches; retry/backoff (max 2); write each batch; stop when N complete.',
        'Create a new Sheet and write N verified leads in 3-row batches (source-cited).',
        'Enrich rows with verified LinkedIn URLs; update-in-place; stop at N.',
        'For {domain}: find founder + public email/contact + LinkedIn; cite sources; max 2 attempts/URL.',
        'Draft a compliant cold email using only verified table data; include opt-out.',
      ],
}
