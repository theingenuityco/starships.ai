/**
 * Piper Agent Template
 * Lead Manager - imported from production export.
 * Manages lead intake, qualification, enrichment, web research, pipeline updates, and compliant outreach.
 */

import * as fs from 'fs'
import * as path from 'path'

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

