'use client'

import Icon from '@/components/primitives/Icon'
import { useConnectorCatalog, useDisconnectConnector, useStarshipConnectors, useStartLinkedInOAuth, useStartDiscordOAuth, useStartGoogleDriveOAuth } from '@/hooks/useConnectors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useMemo, useState } from 'react'
import Image from 'next/image'
import { CONNECTOR_LOGOS } from '@/lib/connectorLogos'

interface StarshipConnectorsPanelProps {
  starshipId: string
}

export function StarshipConnectorsPanel({ starshipId }: StarshipConnectorsPanelProps) {
  const { data: catalog = [] } = useConnectorCatalog()
  const { data: connectors = [], isLoading } = useStarshipConnectors(starshipId, !!starshipId)
  const disconnectMutation = useDisconnectConnector(starshipId)
  const linkedinMutation = useStartLinkedInOAuth(starshipId)
  const discordMutation = useStartDiscordOAuth(starshipId)
  const googleDriveMutation = useStartGoogleDriveOAuth(starshipId)

  const [searchQuery, setSearchQuery] = useState('')

  const getConnectorState = (provider: 'linkedin' | 'discord' | 'google_drive') => connectors.find(connector => connector.provider === provider)

  const handleDisconnect = (provider: 'linkedin' | 'discord' | 'google_drive') => {
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

  const handleGoogleDriveConnect = async () => {
    const result = await googleDriveMutation.mutateAsync()
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
  const googleDrive = catalog.find(c => c.provider === 'google_drive')

  const linkedinState = getConnectorState('linkedin')
  const discordState = getConnectorState('discord')
  const googleDriveState = getConnectorState('google_drive')

  const hasAnyVisibleConnector =
    (linkedin && matchesQuery({ displayName: linkedin.displayName, description: linkedin.description })) ||
    (discord && matchesQuery({ displayName: discord.displayName, description: discord.description })) ||
    (googleDrive && matchesQuery({ displayName: googleDrive.displayName, description: googleDrive.description }))

  const renderLinkedInCard = (connectedFirst: boolean) => {
    if (!linkedin || !matchesQuery({ displayName: linkedin.displayName, description: linkedin.description })) return null
    const isConnected = linkedinState?.status === 'connected'
    if (isConnected !== connectedFirst) return null

    return (
      <Card key={`linkedin-${connectedFirst ? 'connected' : 'disconnected'}`} className="frosted-glass-card shadow-frosted-lg border border-border/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              {CONNECTOR_LOGOS.linkedin && (
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-sm">
                  <Image src={CONNECTOR_LOGOS.linkedin} alt="LinkedIn logo" width={18} height={18} />
                </div>
              )}
              <span className="text-lg">LinkedIn</span>
              <Badge variant={isConnected ? 'default' : 'outline'} className="px-2 py-0.5 text-[10px] leading-tight">
                {isConnected ? 'Connected' : 'Not connected'}
              </Badge>
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-2">{linkedin.description}</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isConnected ? 'outline' : 'default'}
              className={isConnected ? 'min-w-[140px] border-primary text-primary' : 'min-w-[140px]'}
              onClick={handleLinkedInConnect}
              disabled={linkedinMutation.isPending}
            >
              <Icon name={isConnected ? 'repeat' : 'plug'} className="h-4 w-4" />
              {isConnected ? 'Reconnect' : 'Connect LinkedIn'}
            </Button>
            {isConnected && (
              <Button size="sm" variant="outline" className="min-w-[140px]" onClick={() => handleDisconnect('linkedin')} disabled={disconnectMutation.isPending}>
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderDiscordCard = (connectedFirst: boolean) => {
    if (!discord || !matchesQuery({ displayName: discord.displayName, description: discord.description })) return null
    const isConnected = discordState?.status === 'connected'
    if (isConnected !== connectedFirst) return null

    return (
      <Card key={`discord-${connectedFirst ? 'connected' : 'disconnected'}`} className="frosted-glass-card shadow-frosted-lg border border-border/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              {CONNECTOR_LOGOS.discord && (
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-sm">
                  <Image src={CONNECTOR_LOGOS.discord} alt="Discord logo" width={18} height={18} />
                </div>
              )}
              <span className="text-lg">Discord</span>
              <Badge variant={isConnected ? 'default' : 'outline'} className="px-2 py-0.5 text-[10px] leading-tight">
                {isConnected ? 'Connected' : 'Not connected'}
              </Badge>
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-2">{discord.description}</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isConnected ? 'outline' : 'default'}
              className={isConnected ? 'min-w-[140px] border-primary text-primary' : 'min-w-[140px]'}
              onClick={handleDiscordConnect}
              disabled={discordMutation.isPending}
            >
              <Icon name={isConnected ? 'repeat' : 'plug'} className="h-4 w-4" />
              {isConnected ? 'Reconnect' : 'Connect Discord'}
            </Button>
            {isConnected && (
              <Button size="sm" variant="outline" className="min-w-[140px]" onClick={() => handleDisconnect('discord')} disabled={disconnectMutation.isPending}>
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderGoogleDriveCard = (connectedFirst: boolean) => {
    if (!googleDrive || !matchesQuery({ displayName: googleDrive.displayName, description: googleDrive.description })) return null
    const isConnected = googleDriveState?.status === 'connected'
    if (isConnected !== connectedFirst) return null

    return (
      <Card key={`google-drive-${connectedFirst ? 'connected' : 'disconnected'}`} className="frosted-glass-card shadow-frosted-lg border border-border/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              {CONNECTOR_LOGOS.google_drive && (
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-sm">
                  <Image src={CONNECTOR_LOGOS.google_drive} alt="Google Drive logo" width={18} height={18} />
                </div>
              )}
              <span className="text-lg">Google Drive</span>
              <Badge variant={isConnected ? 'default' : 'outline'} className="px-2 py-0.5 text-[10px] leading-tight">
                {isConnected ? 'Connected' : 'Not connected'}
              </Badge>
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-2">{googleDrive.description}</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isConnected ? 'outline' : 'default'}
              className={isConnected ? 'min-w-[140px] border-primary text-primary' : 'min-w-[140px]'}
              onClick={handleGoogleDriveConnect}
              disabled={googleDriveMutation.isPending}
            >
              <Icon name={isConnected ? 'repeat' : 'plug'} className="h-4 w-4" />
              {isConnected ? 'Reconnect' : 'Connect Google Drive'}
            </Button>
            {isConnected && (
              <Button size="sm" variant="outline" className="min-w-[140px]" onClick={() => handleDisconnect('google_drive')} disabled={disconnectMutation.isPending}>
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Connected first */}
        {renderLinkedInCard(true)}
        {renderDiscordCard(true)}
        {renderGoogleDriveCard(true)}

        {/* Then not connected */}
        {renderLinkedInCard(false)}
        {renderDiscordCard(false)}
        {renderGoogleDriveCard(false)}
      </div>
    </div>
  )
}
