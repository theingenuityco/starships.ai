'use client'

import Icon from '@/components/primitives/Icon'
import {
  useConfigureGitHubConnector,
  useConnectorCatalog,
  useDisconnectConnector,
  useStarshipConnectors,
  useStartDiscordOAuth,
  useStartGoogleDriveOAuth,
  useStartLinkedInOAuth,
} from '@/hooks/useConnectors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle as DialogTitlePrimitive } from '@/components/ui/dialog'
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
  const githubConfigMutation = useConfigureGitHubConnector(starshipId)

  const [searchQuery, setSearchQuery] = useState('')
  const [pendingDisconnect, setPendingDisconnect] = useState<'linkedin' | 'discord' | 'google_drive' | 'github' | null>(null)
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [githubInstallationId, setGithubInstallationId] = useState('')
  const [githubDefaultOwner, setGithubDefaultOwner] = useState('')
  const [githubDefaultRepo, setGithubDefaultRepo] = useState('')

  type ConnectorProviderId = 'linkedin' | 'discord' | 'google_drive' | 'github'

  const getConnectorState = (provider: ConnectorProviderId) => connectors.find(connector => connector.provider === provider)

  const openDisconnectConfirm = (provider: 'linkedin' | 'discord' | 'google_drive' | 'github') => {
    setPendingDisconnect(provider)
  }

  const handleConfirmDisconnect = () => {
    if (!pendingDisconnect) return
    disconnectMutation.mutate(pendingDisconnect)
    setPendingDisconnect(null)
  }

  const handleLinkedInConnect = async () => {
    const result = await linkedinMutation.mutateAsync()
    if (result) {
      // Debug: see where we're redirecting for LinkedIn OAuth
      console.log('[StarshipConnectorsPanel] Redirecting to LinkedIn OAuth URL:', result)
      window.location.href = result
    }
  }

  const handleDiscordConnect = async () => {
    const result = await discordMutation.mutateAsync()
    if (result) {
      // Debug: see where we're redirecting for Discord OAuth
      console.log('[StarshipConnectorsPanel] Redirecting to Discord OAuth URL:', result)
      window.location.href = result
    }
  }

  const handleGoogleDriveConnect = async () => {
    const result = await googleDriveMutation.mutateAsync()
    if (result) {
      // Debug: see where we're redirecting for Google Drive OAuth
      console.log('[StarshipConnectorsPanel] Redirecting to Google Drive OAuth URL:', result)
      window.location.href = result
    }
  }

  const handleGitHubConnect = () => {
    const state = getConnectorState('github')
    const metadata = (state?.metadata || {}) as Record<string, any>
    setGithubInstallationId(metadata.githubInstallationId || '')
    setGithubDefaultOwner(metadata.defaultOwner || '')
    setGithubDefaultRepo(metadata.defaultRepo || '')
    setGithubDialogOpen(true)
  }

  const handleGitHubSave = async () => {
    if (!githubInstallationId.trim()) return
    await githubConfigMutation.mutateAsync({
      installationId: githubInstallationId.trim(),
      defaultOwner: githubDefaultOwner.trim() || undefined,
      defaultRepo: githubDefaultRepo.trim() || undefined,
    })
    setGithubDialogOpen(false)
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

  const PROVIDERS: ConnectorProviderId[] = ['linkedin', 'discord', 'google_drive', 'github']

  const CONNECTOR_LABELS: Record<ConnectorProviderId, string> = {
    linkedin: 'LinkedIn',
    discord: 'Discord',
    google_drive: 'Google Drive',
    github: 'GitHub',
  }

  const hasAnyVisibleConnector = PROVIDERS.some(provider => {
    const item = catalog.find(c => c.provider === provider)
    return item && matchesQuery({ displayName: item.displayName, description: item.description })
  })

  const handleConnect = (provider: ConnectorProviderId) => {
    switch (provider) {
      case 'linkedin':
        return handleLinkedInConnect()
      case 'discord':
        return handleDiscordConnect()
      case 'google_drive':
        return handleGoogleDriveConnect()
      case 'github':
        return handleGitHubConnect()
    }
  }

  const renderConnectorCard = (provider: ConnectorProviderId, connectedFirst: boolean) => {
    const catalogItem = catalog.find(c => c.provider === provider)
    if (!catalogItem || !matchesQuery({ displayName: catalogItem.displayName, description: catalogItem.description })) {
      return null
    }

    const state = getConnectorState(provider)
    const isConnected = state?.status === 'connected'
    if (!!isConnected !== connectedFirst) return null

    const label = CONNECTOR_LABELS[provider]
    const logoSrc = CONNECTOR_LOGOS[provider]

    return (
      <Card key={`${provider}-${connectedFirst ? 'connected' : 'disconnected'}`} className="frosted-glass-card shadow-frosted-lg border border-border/40">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              {logoSrc && (
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white shadow-sm">
                  <Image src={logoSrc} alt={`${label} logo`} width={24} height={24} />
                </div>
              )}
              <div className="flex h-10 flex-col justify-center">
                <span className="text-lg leading-tight">{label}</span>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-slate-400'}`} />
                  <span className={isConnected ? 'text-slate-600 dark:text-slate-400' : 'text-muted-foreground'}>{isConnected ? 'Connected' : 'Not connected'}</span>
                </div>
              </div>
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">{catalogItem.description}</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isConnected ? 'primaryOutline' : 'default'}
              className="min-w-[140px]"
              onClick={() => handleConnect(provider)}
              disabled={
                provider === 'linkedin'
                  ? linkedinMutation.isPending
                  : provider === 'discord'
                    ? discordMutation.isPending
                    : provider === 'google_drive'
                      ? googleDriveMutation.isPending
                      : githubConfigMutation.isPending
              }
            >
              <Icon name={isConnected ? 'repeat' : 'plug'} className="h-4 w-4" />
              {isConnected ? 'Reconnect' : `Connect ${label}`}
            </Button>
            {isConnected && (
              <Button
                size="sm"
                variant="outline"
                className="min-w-[140px] hover:border-destructive/60 hover:text-destructive hover:bg-destructive/10"
                onClick={() => openDisconnectConfirm(provider)}
                disabled={disconnectMutation.isPending}
              >
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
        {PROVIDERS.map(provider => renderConnectorCard(provider, true))}

        {/* Then not connected */}
        {PROVIDERS.map(provider => renderConnectorCard(provider, false))}
      </div>

      <Dialog open={pendingDisconnect !== null} onOpenChange={open => !open && setPendingDisconnect(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitlePrimitive>Disconnect connector?</DialogTitlePrimitive>
            <DialogDescription>
              {pendingDisconnect
                ? `If you disconnect ${
                    pendingDisconnect === 'google_drive' ? 'Google Drive' : pendingDisconnect === 'linkedin' ? 'LinkedIn' : pendingDisconnect === 'discord' ? 'Discord' : 'GitHub'
                  }, any tools that rely on this connector will stop working until you reconnect.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setPendingDisconnect(null)} disabled={disconnectMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDisconnect} disabled={disconnectMutation.isPending}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={githubDialogOpen} onOpenChange={open => !open && setGithubDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitlePrimitive>Configure GitHub connector</DialogTitlePrimitive>
            <DialogDescription>Link this starship to a GitHub App installation by providing the installation ID and, optionally, a default owner and repository.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="github-installation-id">
                Installation ID
              </label>
              <Input id="github-installation-id" value={githubInstallationId} onChange={e => setGithubInstallationId(e.target.value)} placeholder="e.g. 12345678" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="github-default-owner">
                Default owner (optional)
              </label>
              <Input id="github-default-owner" value={githubDefaultOwner} onChange={e => setGithubDefaultOwner(e.target.value)} placeholder="e.g. your-org" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="github-default-repo">
                Default repo (optional)
              </label>
              <Input id="github-default-repo" value={githubDefaultRepo} onChange={e => setGithubDefaultRepo(e.target.value)} placeholder="e.g. your-repo" />
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setGithubDialogOpen(false)} disabled={githubConfigMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={handleGitHubSave} disabled={githubConfigMutation.isPending || !githubInstallationId.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
