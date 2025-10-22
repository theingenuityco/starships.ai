'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'
import { track } from '@/lib/analytics'

type DemoStep = { type: 'plan'; content: string } | { type: 'tool_call'; tool: string; args: Record<string, unknown>; result: string } | { type: 'guardrail'; rule: string; status: 'pass' | 'fail' }

type DemoRun = {
  id: string
  status: 'pending' | 'running' | 'completed'
  steps: DemoStep[]
  metrics?: { latencyMs: number; retries: number }
}

export default function InteractiveDemo() {
  const [scenario, setScenario] = useState<'enrichment' | 'copilot'>('enrichment')
  const [input, setInput] = useState('Find recent news for Acme and enrich company profile')
  const [run, setRun] = useState<DemoRun | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setRun(null)
  }, [scenario])

  const scenarioLabel = useMemo(() => (scenario === 'enrichment' ? 'Data Research & Enrichment' : 'Internal Workflow Copilot'), [scenario])

  const startDemo = async () => {
    setLoading(true)
    try {
      track({ type: 'demo_started', scenario })
      const res = await fetch(`/api/demo-run?scenario=${scenario}`, { cache: 'no-store' })
      const data: DemoRun = await res.json()
      setRun(data)
      track({ type: 'demo_completed', scenario })
    } catch (e) {
      // noop
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="interactive-demo" className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-3xl md:text-4xl font-semibold mb-2">Interactive demo</h2>
            <p className="text-muted-foreground">{scenarioLabel}</p>
            <div className="text-xs text-white/60 mt-1">Simulated trace for illustration</div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={scenario === 'enrichment' ? 'default' : 'outline'}
              onClick={() => {
                setScenario('enrichment')
                track({ type: 'use_case_toggled', scenario: 'enrichment' })
              }}
            >
              Enrichment
            </Button>
            <Button
              variant={scenario === 'copilot' ? 'default' : 'outline'}
              onClick={() => {
                setScenario('copilot')
                track({ type: 'use_case_toggled', scenario: 'copilot' })
              }}
            >
              Copilot
            </Button>
          </div>
        </div>

        <Card className="p-4 bg-white/5 border-white/10">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-1 space-y-3">
              <label className="text-sm text-muted-foreground">Input</label>
              <textarea value={input} onChange={e => setInput(e.target.value)} rows={4} className="w-full rounded-md bg-black/30 border border-white/10 p-3 text-sm outline-none" />
              <Button onClick={startDemo} disabled={loading}>
                <Icon name="play" className="w-4 h-4 mr-2" />
                {loading ? 'Running...' : 'Run demo'}
              </Button>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground">Trace</label>
              <div className="mt-2 h-[280px] overflow-auto rounded-md bg-black/30 border border-white/10 p-3 text-sm space-y-2">
                {!run && <div className="text-muted-foreground">Run the demo to see a live trace.</div>}
                {run?.steps.map((s, idx) => {
                  if (s.type === 'plan') {
                    return (
                      <div key={idx} className="flex items-start gap-2 p-2 rounded bg-black/20">
                        <Icon name="workflow" className="w-4 h-4 mt-0.5" />
                        <div>
                          <div className="text-white/90">Plan</div>
                          <div className="text-white/70">{s.content}</div>
                        </div>
                      </div>
                    )
                  }
                  if (s.type === 'tool_call') {
                    return (
                      <div key={idx} className="flex items-start gap-2 p-2 rounded bg-black/20">
                        <Icon name="plug" className="w-4 h-4 mt-0.5" />
                        <div>
                          <div className="text-white/90">{s.tool}</div>
                          <div className="text-white/70 text-xs">args: {JSON.stringify(s.args)}</div>
                          <div className="text-white/70">{s.result}</div>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded bg-black/20">
                      <Icon name={s.status === 'pass' ? 'shield-check' : 'shield-alert'} className="w-4 h-4 mt-0.5" />
                      <div>
                        <div className="text-white/90">Guardrail: {s.rule}</div>
                        <div className="text-white/70">{s.status === 'pass' ? 'Passed' : 'Failed'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {run?.metrics && (
                <div className="mt-2 text-xs text-white/60">
                  latency: {run.metrics.latencyMs} ms • retries: {run.metrics.retries}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </section>
  )
}
