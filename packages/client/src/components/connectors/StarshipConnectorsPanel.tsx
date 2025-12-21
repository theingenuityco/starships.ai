'use client'

import Icon from '@/components/primitives/Icon'
import { useConnectorCatalog, useDisconnectConnector, useStarshipConnectors, useStartOAuthConnector } from '@/hooks/useConnectors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle as DialogTitlePrimitive } from '@/components/ui/dialog'
import { useMemo, useState } from 'react'
import Image from 'next/image'
import { CONNECTOR_LOGOS } from '@/lib/connectorLogos'
import { motion } from 'motion/react'

const CONNECTOR_CTA_BUTTON_CLASS =
  'h-9 px-3 font-medium transition-all duration-200 border border-transparent text-[rgba(245,158,11,0.8)] hover:text-[rgba(245,158,11,0.8)] hover:border-[rgba(245,158,11,0.25)] hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(251,191,36,0.06))] hover:shadow-[0_0_4px_rgba(245,158,11,0.10)] disabled:text-muted-foreground disabled:hover:text-muted-foreground disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none'
const CONNECTOR_CTA_ICON_CLASS = 'mr-1.5 h-4 w-4 text-[rgba(245,158,11,0.85)] group-disabled:text-muted-foreground'

interface StarshipConnectorsPanelProps {
  starshipId: string
}

export function StarshipConnectorsPanel({ starshipId }: StarshipConnectorsPanelProps) {
  const { data: catalog = [] } = useConnectorCatalog()
  const { data: connectors = [], isLoading } = useStarshipConnectors(starshipId, !!starshipId)
  const disconnectMutation = useDisconnectConnector(starshipId)
  const oauthMutation = useStartOAuthConnector(starshipId)

  const [searchQuery, setSearchQuery] = useState('')
  const [pendingDisconnect, setPendingDisconnect] = useState<string | null>(null)
  // GitHub connector configuration temporarily disabled on client
  // const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  // const [githubInstallationId, setGithubInstallationId] = useState('')
  // const [githubDefaultOwner, setGithubDefaultOwner] = useState('')
  // const [githubDefaultRepo, setGithubDefaultRepo] = useState('')

  const getConnectorState = (provider: string) => connectors.find(connector => connector.provider === provider)

  const openDisconnectConfirm = (provider: string) => {
    setPendingDisconnect(provider)
  }

  const handleConfirmDisconnect = () => {
    if (!pendingDisconnect) return
    disconnectMutation.mutate(pendingDisconnect)
    setPendingDisconnect(null)
  }

  const handleConnect = async (provider: string) => {
    const result = await oauthMutation.mutateAsync(provider as any)
    if (result) {
      window.location.href = result
    }
  }

  // Google Drive and GitHub connectors are temporarily disabled on the client
  // const handleGoogleDriveConnect = async () => {
  //   const result = await googleDriveMutation.mutateAsync()
  //   if (result) {
  //     window.location.href = result
  //   }
  // }
  //
  // const handleGitHubConnect = () => {
  //   const state = getConnectorState('github')
  //   const metadata = (state?.metadata || {}) as Record<string, any>
  //   setGithubInstallationId(metadata.githubInstallationId || '')
  //   setGithubDefaultOwner(metadata.defaultOwner || '')
  //   setGithubDefaultRepo(metadata.defaultRepo || '')
  //   setGithubDialogOpen(true)
  // }
  //
  // const handleGitHubSave = async () => {
  //   if (!githubInstallationId.trim()) return
  //   await githubConfigMutation.mutateAsync({
  //     installationId: githubInstallationId.trim(),
  //     defaultOwner: githubDefaultOwner.trim() || undefined,
  //     defaultRepo: githubDefaultRepo.trim() || undefined,
  //   })
  //   setGithubDialogOpen(false)
  // }

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const matchesQuery = useMemo(
    () => (entry: { displayName: string; description: string }) =>
      !normalizedQuery || entry.displayName.toLowerCase().includes(normalizedQuery) || entry.description.toLowerCase().includes(normalizedQuery),
    [normalizedQuery]
  )

  // Show connectors that have an interactive connect flow: OAuth2 or custom
  // (e.g. GitHub App, which uses a custom connect blueprint).
  const connectableCatalog = useMemo(() => catalog.filter(entry => entry.authType === 'oauth2' || entry.authType === 'custom'), [catalog])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground text-sm">Loading connectors...</p>
      </div>
    )
  }

  const hasAnyVisibleConnector = connectableCatalog.some(item => {
    return matchesQuery({ displayName: item.displayName, description: item.description })
  })

  const renderConnectorCard = (provider: string, connectedFirst: boolean) => {
    const catalogItem = connectableCatalog.find((c: { provider: string }) => c.provider === provider)
    if (!catalogItem || !matchesQuery({ displayName: catalogItem.displayName, description: catalogItem.description })) {
      return null
    }

    const state = getConnectorState(provider)
    const isConnected = state?.status === 'connected'
    if (!!isConnected !== connectedFirst) return null

    const label = catalogItem.displayName
    const logoSrc = CONNECTOR_LOGOS[provider]

    return (
      <motion.div
        key={`${provider}-${connectedFirst ? 'connected' : 'disconnected'}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="h-full"
      >
        <Card className="group relative overflow-hidden h-full flex flex-col rounded-lg bg-card border border-border/40 shadow-sm transition-colors duration-200 hover:bg-muted/30 hover:border-muted hover:shadow-md">
          <CardHeader className="pb-3 relative z-10 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3">
                {logoSrc && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white shadow-sm border border-border/40">
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
          <CardContent className="relative z-10 pt-0 pb-5 mt-auto">
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                className={`${CONNECTOR_CTA_BUTTON_CLASS} group min-w-[140px] justify-center`}
                onClick={() => handleConnect(provider)}
                disabled={oauthMutation.isPending}
              >
                <Icon name={isConnected ? 'repeat' : 'plug'} className={CONNECTOR_CTA_ICON_CLASS} />
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
      </motion.div>
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
        {connectableCatalog.map(entry => renderConnectorCard(entry.provider, true))}

        {/* Then not connected */}
        {connectableCatalog.map(entry => renderConnectorCard(entry.provider, false))}
      </div>

      <Dialog open={pendingDisconnect !== null} onOpenChange={open => !open && setPendingDisconnect(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitlePrimitive>Disconnect connector?</DialogTitlePrimitive>
            <DialogDescription>{pendingDisconnect ? `If you disconnect ${pendingDisconnect}, any tools that rely on this connector will stop working until you reconnect.` : null}</DialogDescription>
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

      {/* GitHub connector configuration dialog temporarily disabled */}
      {/* <Dialog open={githubDialogOpen} onOpenChange={open => !open && setGithubDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitlePrimitive>Configure GitHub connector</DialogTitlePrimitive>
            <DialogDescription>
              Link this starship to a GitHub App installation by providing the installation ID and, optionally, a default owner and repository.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="github-installation-id">
                Installation ID
              </label>
              <Input
                id="github-installation-id"
                value={githubInstallationId}
                onChange={e => setGithubInstallationId(e.target.value)}
                placeholder="e.g. 12345678"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="github-default-owner">
                Default owner (optional)
              </label>
              <Input
                id="github-default-owner"
                value={githubDefaultOwner}
                onChange={e => setGithubDefaultOwner(e.target.value)}
                placeholder="e.g. your-org"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="github-default-repo">
                Default repo (optional)
              </label>
              <Input
                id="github-default-repo"
                value={githubDefaultRepo}
                onChange={e => setGithubDefaultRepo(e.target.value)}
                placeholder="e.g. your-repo"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setGithubDialogOpen(false)} disabled={githubConfigMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleGitHubSave}
              disabled={githubConfigMutation.isPending || !githubInstallationId.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog> */}
    </div>
  )
}
