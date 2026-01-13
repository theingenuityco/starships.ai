'use client'

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import AgentAvatar from '@/components/animated/AgentAvatar'
import Icon from '@/components/primitives/Icon'
import { useRouter } from 'next/navigation'
import type { AgentModel } from '@starships/protocol'

interface AgentDeploymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentName: string
  agentRole: string
  agentSlug: string
  agentId: string
  starshipSlug: string
  agent?: AgentModel | null
}

export function AgentDeploymentModal({ open, onOpenChange, agentName, agentRole, agentSlug, agentId, starshipSlug, agent }: AgentDeploymentModalProps) {
  const router = useRouter()

  const handleLater = () => {
    onOpenChange(false)
    // Navigate to chat with this agent
    router.push(`/ship/${starshipSlug}/conversations?agent=${agentSlug}`)
  }

  const handleContinue = () => {
    onOpenChange(false)
    // Stay on connectors page (just close modal)
  }

  const category = (agent as any)?.category as string | undefined
  const version = agent?.version

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="sparkles" className="w-5 h-5 text-primary" />
            Agent Deployed
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Agent Info Card */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Avatar className="h-20 w-20 rounded-full ring-1 ring-border/40 shadow-sm flex-shrink-0">
                <AgentAvatar seed={agentName} size={80} rounded />
              </Avatar>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-base leading-tight">{agentName}</h4>
                {agentRole && <p className="text-sm text-muted-foreground mt-0.5">{agentRole}</p>}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {category && (
                    <Badge variant="outline" className="text-xs">
                      {category}
                    </Badge>
                  )}
                  {version && (
                    <Badge variant="secondary" className="text-xs font-mono">
                      v{version}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Call to Action Message */}
          <div className="rounded-lg p-4 border border-primary/20 bg-primary/5 dark:bg-primary/10">
            <div className="flex items-center gap-2 justify-center">
              <Icon name="plug" className="h-5 w-5 text-primary" />
              <p className="text-base font-semibold text-foreground">Now Connect your app to {agentRole}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleLater}
            className="flex-1 sm:flex-none h-9 px-3 font-medium transition-all duration-200 border border-transparent text-[rgba(245,158,11,0.8)] hover:text-[rgba(245,158,11,0.8)] hover:border-[rgba(245,158,11,0.25)] hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(251,191,36,0.06))] hover:shadow-[0_0_4px_rgba(245,158,11,0.10)] disabled:text-muted-foreground disabled:hover:text-muted-foreground disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none"
          >
            Later
          </Button>
          <Button type="button" onClick={handleContinue} className="flex-1 sm:flex-none">
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
