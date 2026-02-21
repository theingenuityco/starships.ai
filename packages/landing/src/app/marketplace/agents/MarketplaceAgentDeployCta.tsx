'use client'

import Link from 'next/link'
import type { AgentTemplateModel } from '@starships/protocol'
import { Button } from '@/components/ui/button'

export function MarketplaceAgentDeployCta({ template }: { template: AgentTemplateModel }) {
  // Public site: send users to auth entrypoint.
  // The actual deploy flow lives inside the authenticated app.
  const href = `/login?next=${encodeURIComponent(`/explore/agents/${template.slug}`)}`
  return (
    <Button asChild size="sm" className="h-9">
      <Link href={href}>Deploy</Link>
    </Button>
  )
}

