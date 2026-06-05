'use client'

import { useParams } from 'next/navigation'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { PageHeader } from '@/components/ui/PageHeader'

// External-agent registry. Agents bring their own runtime and connect via the
// MCP server using a per-agent connection token (minted in settings).
export default function AgentsPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const { data: starship } = useStarshipBySlug(slug, !!slug)
  const starshipId = starship?.id ?? ''
  const { data: agents = [], isLoading } = useStarshipAgents(starshipId, !!starshipId)

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title="Agents" />
      <p className="text-sm text-muted-foreground">
        Registered external agents. Each agent connects to this workspace via the MCP server using a connection token.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading agents…</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agents registered yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {agents.map((agent) => (
            <li key={agent.id} className="rounded-md border border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{agent.name}</span>
                <span className="text-xs rounded bg-accent px-2 py-0.5 text-muted-foreground">{agent.kind}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {agent.accessRole}
                {agent.description ? ` · ${agent.description}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
