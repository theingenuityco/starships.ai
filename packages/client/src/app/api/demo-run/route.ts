import { NextResponse } from 'next/server'

function enrichmentTrace() {
  return {
    id: 'run_enrichment',
    status: 'completed',
    steps: [
      { type: 'plan', content: 'Search web, extract entities, enrich company profile' },
      { type: 'tool_call', tool: 'web.search', args: { q: 'Acme news last 7 days' }, result: 'Found 3 relevant articles' },
      { type: 'guardrail', rule: 'PII-check', status: 'pass' },
      { type: 'tool_call', tool: 'db.enrich', args: { entity: 'Acme' }, result: 'Added funding + partners' },
    ],
    metrics: { latencyMs: 3200, retries: 1 },
  }
}

function copilotTrace() {
  return {
    id: 'run_copilot',
    status: 'completed',
    steps: [
      { type: 'plan', content: 'Summarize conversation, create Jira ticket, notify Slack' },
      { type: 'tool_call', tool: 'slack.fetchThread', args: { channel: '#support' }, result: 'Thread with 12 messages' },
      { type: 'guardrail', rule: 'Policy-mentions', status: 'pass' },
      { type: 'tool_call', tool: 'jira.createIssue', args: { type: 'Bug' }, result: 'JIRA-123 created' },
    ],
    metrics: { latencyMs: 2700, retries: 0 },
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const scenario = searchParams.get('scenario')
  if (scenario === 'copilot') {
    return NextResponse.json(copilotTrace())
  }
  return NextResponse.json(enrichmentTrace())
}
