'use client'

import Icon from '@/components/primitives/Icon'
import { useConnectorCatalog, useDisconnectConnector, useStarshipConnectors, useStartLinkedInOAuth, useStartDiscordOAuth } from '@/hooks/useConnectors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useMemo, useState } from 'react'

interface StarshipConnectorsPanelProps {
  starshipId: string
}

export function StarshipConnectorsPanel({ starshipId }: StarshipConnectorsPanelProps) {
  const { data: catalog = [] } = useConnectorCatalog()
  const { data: connectors = [], isLoading } = useStarshipConnectors(starshipId, !!starshipId)
  const disconnectMutation = useDisconnectConnector(starshipId)
  const linkedinMutation = useStartLinkedInOAuth(starshipId)
  const discordMutation = useStartDiscordOAuth(starshipId)

  const [searchQuery, setSearchQuery] = useState('')

  const getConnectorState = (provider: 'linkedin' | 'discord') => connectors.find(connector => connector.provider === provider)

  const handleDisconnect = (provider: 'linkedin' | 'discord') => {
    disconnectMutation.mutate(provider)
  }

  const handleLinkedInConnect = async () => {
    const result = await linkedinMutation.mutateAsync()
    if (result) {
      window.location.href = result
    }
  }

  const handleDiscordConnect = async () => {
    const result = await discordMutation.mutateAsync()
    if (result) {
      window.location.href = result
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const matchesQuery = useMemo(
    () => (entry: { displayName: string; description: string }) =>
      !normalizedQuery || entry.displayName.toLowerCase().includes(normalizedQuery) || entry.description.toLowerCase().includes(normalizedQuery),
    [normalizedQuery]
  )

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground text-sm">Loading connectors...</p>
      </div>
    )
  }

  const linkedin = catalog.find(c => c.provider === 'linkedin')
  const discord = catalog.find(c => c.provider === 'discord')

  const linkedinState = getConnectorState('linkedin')
  const discordState = getConnectorState('discord')

  const hasAnyVisibleConnector =
    (linkedin && matchesQuery({ displayName: linkedin.displayName, description: linkedin.description })) ||
    (discord && matchesQuery({ displayName: discord.displayName, description: discord.description }))

  return (
    <div className="space-y-6">
      {/* Search - match Environment page styling */}
      <div className="mb-8 sticky top-6 z-30">
        <div className="relative max-w-md mb-6 mx-auto">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
          <Input
            type="text"
            placeholder="Search connectors..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 pr-3 w-full frosted-glass-card shadow-frosted-lg rounded-2xl border border-border/40 bg-transparent text-sm"
          />
        </div>
      </div>

      {!hasAnyVisibleConnector && <p className="text-sm text-muted-foreground">No connectors match “{searchQuery}”. Try a different search.</p>}

      <div className="grid gap-6 md:grid-cols-2">
        {linkedin && matchesQuery({ displayName: linkedin.displayName, description: linkedin.description }) && (
          <Card className="frosted-glass-card shadow-frosted-lg border border-border/40">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <span className="text-lg">LinkedIn</span>
                  <Badge variant={linkedinState?.status === 'connected' ? 'default' : 'outline'}>{linkedinState?.status === 'connected' ? 'Connected' : 'Not connected'}</Badge>
                </CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{linkedin.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                <div className="font-medium mb-1">Managed environment variables</div>
                <ul className="list-disc list-inside space-y-1">
                  {linkedin.requiredEnvKeys.map(key => (
                    <li key={key}>
                      <span className="font-mono text-[11px]">{key}</span>
                    </li>
                  ))}
                  {(linkedin.optionalEnvKeys || []).map(key => (
                    <li key={key}>
                      <span className="font-mono text-[11px]">{key}</span> <span className="text-muted-foreground">(optional)</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleLinkedInConnect} disabled={linkedinMutation.isPending}>
                  {linkedinState?.status === 'connected' ? 'Reconnect LinkedIn' : 'Connect LinkedIn'}
                </Button>
                {linkedinState?.status === 'connected' && (
                  <Button size="sm" variant="outline" onClick={() => handleDisconnect('linkedin')} disabled={disconnectMutation.isPending}>
                    Disconnect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {discord && matchesQuery({ displayName: discord.displayName, description: discord.description }) && (
          <Card className="frosted-glass-card shadow-frosted-lg border border-border/40">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <span className="text-lg">Discord</span>
                  <Badge variant={discordState?.status === 'connected' ? 'default' : 'outline'}>{discordState?.status === 'connected' ? 'Connected' : 'Not connected'}</Badge>
                </CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{discord.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                <div className="font-medium mb-1">Bot access</div>
                <p className="mb-2">Install the Starships bot into your Discord server. The bot can send messages in channels where it has permission.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleDiscordConnect} disabled={discordMutation.isPending}>
                  {discordState?.status === 'connected' ? 'Reconnect Discord' : 'Connect Discord'}
                </Button>
                {discordState?.status === 'connected' && (
                  <Button size="sm" variant="outline" onClick={() => handleDisconnect('discord')} disabled={disconnectMutation.isPending}>
                    Disconnect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
