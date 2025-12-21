'use client'

import type { Blueprint } from '@starships/autopilot'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'

const DEMO_TOOL_BLUEPRINT: Blueprint = {
  nodes: [
    {
      ref: 'start',
      name: 'Start',
      type: 'start',
      description: 'Trigger the workflow.',
      parameters: {},
      metadata: {},
    },
    {
      ref: 'fetch_email',
      name: 'Fetch customer email',
      type: 'http_request',
      description: 'Load the latest inbound message (or thread) from your inbox.',
      parameters: {
        method: 'GET',
        path: '/inbox/latest',
      },
      metadata: {},
    },
    {
      ref: 'summarize_and_draft',
      name: 'Summarize + draft reply',
      type: 'llm',
      description: 'Create a short summary and a friendly reply draft.',
      parameters: {
        tone: 'friendly',
        output: 'summary + draft',
      },
      metadata: {},
    },
    {
      ref: 'approval_gate',
      name: 'Approval required?',
      type: 'conditional',
      description: 'Only send if a human approves.',
      parameters: {},
      metadata: {},
    },
    {
      ref: 'save_draft',
      name: 'Save draft',
      type: 'tool',
      description: 'Create an email draft (no send).',
      parameters: {
        tool: 'draft_reply',
      },
      metadata: {},
    },
    {
      ref: 'escalate',
      name: 'Escalate to human',
      type: 'tool',
      description: 'Flag urgent/angry threads for a teammate.',
      parameters: {
        tool: 'create_ticket',
      },
      metadata: {},
    },
    {
      ref: 'done',
      name: 'Done',
      type: 'end',
      description: 'Return the summary + draft for review.',
      parameters: {},
      metadata: {},
    },
  ],
  edges: [
    { ref: 'e1', from: 'start', to: 'fetch_email', label: '' },
    { ref: 'e2', from: 'fetch_email', to: 'summarize_and_draft', label: '' },
    { ref: 'e3', from: 'summarize_and_draft', to: 'approval_gate', label: '' },
    { ref: 'e4_yes', from: 'approval_gate', to: 'save_draft', label: 'approved', condition: { equals: true } as any },
    { ref: 'e4_no', from: 'approval_gate', to: 'escalate', label: 'needs help', condition: { equals: false } as any },
    { ref: 'e5', from: 'save_draft', to: 'done', label: '' },
    { ref: 'e6', from: 'escalate', to: 'done', label: '' },
  ],
}

export default function ToolsBlueprintDemo() {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-background/60 shadow-md shadow-black/30">
      <div className="px-4 sm:px-6 py-4 border-b border-border/40 bg-background/10 backdrop-blur">
        <div className="text-sm font-medium leading-none truncate">Draft Reply</div>
        <div className="mt-1 text-xs text-muted-foreground truncate">Tools Builder</div>
      </div>
      <div className="h-[420px] md:h-[520px] p-0">
        <BlueprintVisualization
          blueprint={DEMO_TOOL_BLUEPRINT}
          className="h-full"
          transparent
          nodesDraggable={false}
          borderless={true}
          fitViewMaxZoom={0.9}
          containerStyle={{ background: 'hsl(var(--background))' }}
        />
      </div>
    </div>
  )
}


