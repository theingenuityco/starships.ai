'use client'

import Icon from '@/components/primitives/Icon'
import { useConnectApiKeyConnector, useConnectBasicAuthConnector, useConnectorCatalog, useDisconnectConnector, useStarshipConnectors, useStartOAuthConnector } from '@/hooks/useConnectors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle as DialogTitlePrimitive } from '@/components/ui/dialog'
import { useMemo, useState } from 'react'
import Image from 'next/image'
import { CONNECTOR_LOGOS } from '@/lib/connectorLogos'
import { motion } from 'motion/react'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

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
  const apiKeyMutation = useConnectApiKeyConnector(starshipId)
  const basicMutation = useConnectBasicAuthConnector(starshipId)

  const [searchQuery, setSearchQuery] = useState('')
  const [pendingDisconnect, setPendingDisconnect] = useState<string | null>(null)
  const [apiKeyDialogProvider, setApiKeyDialogProvider] = useState<string | null>(null)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [apiKeyExtraConfigText, setApiKeyExtraConfigText] = useState('')
  const [basicDialogProvider, setBasicDialogProvider] = useState<string | null>(null)
  const [basicUsernameValue, setBasicUsernameValue] = useState('')
  const [basicPasswordValue, setBasicPasswordValue] = useState('')
  const [basicExtraConfigText, setBasicExtraConfigText] = useState('')
  const [preOauthProvider, setPreOauthProvider] = useState<string | null>(null)
  const [preOauthMissingKeys, setPreOauthMissingKeys] = useState<string[]>([])
  const [preOauthSchema, setPreOauthSchema] = useState<any>(null)
  const [preOauthValues, setPreOauthValues] = useState<Record<string, string>>({})
  const [preOauthErrors, setPreOauthErrors] = useState<Record<string, string>>({})
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
    const catalogItem = visibleCatalog.find((c: { provider: string }) => c.provider === provider)
    const requiredKeys = (catalogItem as any)?.oauthRequiredMetadataKeys as string[] | undefined
    const schemaFromCatalog = (catalogItem as any)?.metadataSchema
    const existingMetadata = ((getConnectorState(provider)?.metadata || {}) as Record<string, unknown>) || {}

    if (Array.isArray(requiredKeys) && requiredKeys.length) {
      const missing = requiredKeys.filter(k => {
        const raw = existingMetadata[k]
        if (raw === undefined || raw === null) return true
        if (typeof raw === 'string' && raw.trim().length === 0) return true
        return false
      })
      if (missing.length) {
        setPreOauthProvider(provider)
        setPreOauthMissingKeys(missing)
        setPreOauthSchema(schemaFromCatalog || null)
        setPreOauthValues({})
        setPreOauthErrors({})
        return
      }
    }

    try {
      const result = await oauthMutation.mutateAsync(provider as any)
      if (result) window.location.href = result
    } catch (err: any) {
      const code = err?.response?.data?.error?.code
      const details = err?.response?.data?.error?.details

      if (code === 'MISSING_REQUIRED_FIELD' && details?.kind === 'connector_oauth_pre_metadata') {
        setPreOauthProvider(provider)
        setPreOauthMissingKeys(Array.isArray(details?.missingMetadataKeys) ? details.missingMetadataKeys : [])
        setPreOauthSchema(details?.metadataSchema || null)
        setPreOauthValues({})
        setPreOauthErrors({})
        return
      }

      const errorMessage = err?.response?.data?.error?.message || err?.message || 'Failed to start connector OAuth flow'
      toast.error(`Failed to connect ${provider}`, { description: errorMessage })
    }
  }

  const validatePreOauth = (keys: string[], values: Record<string, string>, schema: any): Record<string, string> => {
    const errors: Record<string, string> = {}
    const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {}
    for (const k of keys) {
      const v = (values?.[k] ?? '').trim()
      if (!v) {
        errors[k] = 'Required'
        continue
      }
      const prop = properties?.[k]
      const pattern = typeof prop?.pattern === 'string' ? prop.pattern : null
      if (pattern) {
        try {
          const re = new RegExp(pattern)
          if (!re.test(v)) errors[k] = 'Invalid format'
        } catch {
          // ignore invalid regex in schema
        }
      }
    }
    return errors
  }

  const submitPreOauth = async () => {
    if (!preOauthProvider) return
    const errors = validatePreOauth(preOauthMissingKeys, preOauthValues, preOauthSchema)
    setPreOauthErrors(errors)
    if (Object.keys(errors).length) return

    const result = await oauthMutation.mutateAsync({
      provider: preOauthProvider as any,
      metadata: Object.fromEntries(Object.entries(preOauthValues).map(([k, v]) => [k, v.trim()])),
    } as any)
    if (result) window.location.href = result
  }

  const openApiKeyDialog = (provider: string) => {
    setApiKeyDialogProvider(provider)
    setApiKeyValue('')
    setApiKeyExtraConfigText('')
  }

  const handleApiKeyConnect = async () => {
    if (!apiKeyDialogProvider) return
    const trimmedKey = apiKeyValue.trim()
    if (!trimmedKey) return

    let extraConfig: Record<string, unknown> | undefined = undefined
    const rawExtra = apiKeyExtraConfigText.trim()
    if (rawExtra) {
      const parsed = JSON.parse(rawExtra)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        toast.error('extraConfig must be a JSON object')
        return
      }
      extraConfig = parsed as Record<string, unknown>
    }

    await apiKeyMutation.mutateAsync({ provider: apiKeyDialogProvider as any, apiKey: trimmedKey, extraConfig })
    setApiKeyDialogProvider(null)
  }

  const openBasicDialog = (provider: string) => {
    setBasicDialogProvider(provider)
    setBasicUsernameValue('')
    setBasicPasswordValue('')
    setBasicExtraConfigText('')
  }

  const handleBasicConnect = async () => {
    if (!basicDialogProvider) return
    const username = basicUsernameValue.trim()
    if (!username) return

    let extraConfig: Record<string, unknown> | undefined = undefined
    const rawExtra = basicExtraConfigText.trim()
    if (rawExtra) {
      const parsed = JSON.parse(rawExtra)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        toast.error('extraConfig must be a JSON object')
        return
      }
      extraConfig = parsed as Record<string, unknown>
    }

    await basicMutation.mutateAsync({
      provider: basicDialogProvider as any,
      username,
      password: basicPasswordValue.trim() ? basicPasswordValue : undefined,
      extraConfig,
    })
    setBasicDialogProvider(null)
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
    () => (entry: { name: string; description: string }) => !normalizedQuery || entry.name.toLowerCase().includes(normalizedQuery) || entry.description.toLowerCase().includes(normalizedQuery),
    [normalizedQuery]
  )

  // Catalog is driven by connector_templates (enabled only). UI adapts actions based on auth.type.
  const visibleCatalog = useMemo(() => catalog, [catalog])

  const getProviderLabel = (provider: string | null | undefined) => {
    if (!provider) return ''
    return visibleCatalog.find((c: { provider: string }) => c.provider === provider)?.name ?? provider
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground text-sm">Loading connectors...</p>
      </div>
    )
  }

  const hasAnyVisibleConnector = visibleCatalog.some(item => {
    return matchesQuery({ name: item.name, description: item.description })
  })

  const renderConnectorCard = (provider: string, connectedFirst: boolean) => {
    const catalogItem = visibleCatalog.find((c: { provider: string }) => c.provider === provider)
    if (!catalogItem || !matchesQuery({ name: catalogItem.name, description: catalogItem.description })) {
      return null
    }

    const state = getConnectorState(provider)
    const isConnected = state?.status === 'connected'
    if (!!isConnected !== connectedFirst) return null

    const label = catalogItem.name
    const logoSrc = CONNECTOR_LOGOS[provider]
    const authType = catalogItem.auth?.type
    const canDisconnect = isConnected && authType !== 'platform_jwt'
    const isOauthConnectable = authType === 'oauth2'
    const isApiKeyConnectable = authType === 'api_key'
    const isBasicConnectable = authType === 'basic'
    const isManaged = authType === 'platform_jwt'

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
                onClick={() => {
                  if (isManaged) return
                  if (isOauthConnectable) return void handleConnect(provider)
                  if (isApiKeyConnectable) return openApiKeyDialog(provider)
                  if (isBasicConnectable) return openBasicDialog(provider)
                }}
                disabled={
                  oauthMutation.isPending ||
                  apiKeyMutation.isPending ||
                  basicMutation.isPending ||
                  isManaged ||
                  (!isOauthConnectable && !isApiKeyConnectable && !isBasicConnectable)
                }
              >
                <Icon name={isConnected ? 'repeat' : 'plug'} className={CONNECTOR_CTA_ICON_CLASS} />
                {isManaged
                  ? 'Managed by platform'
                  : isOauthConnectable
                    ? isConnected
                      ? 'Reconnect'
                      : `Connect ${label}`
                    : isApiKeyConnectable
                      ? isConnected
                        ? 'Update API key'
                        : 'Connect with API key'
                      : isBasicConnectable
                        ? isConnected
                          ? 'Update credentials'
                          : 'Connect with Basic auth'
                      : 'Not connectable'}
              </Button>
              {canDisconnect && (
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
        {visibleCatalog.map(entry => renderConnectorCard(entry.provider, true))}

        {/* Then not connected */}
        {visibleCatalog.map(entry => renderConnectorCard(entry.provider, false))}
      </div>

      <Dialog open={pendingDisconnect !== null} onOpenChange={open => !open && setPendingDisconnect(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitlePrimitive>Disconnect connector?</DialogTitlePrimitive>
            <DialogDescription>
              {pendingDisconnect ? `If you disconnect ${getProviderLabel(pendingDisconnect)}, any tools that rely on this connector will stop working until you reconnect.` : null}
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

      <Dialog
        open={preOauthProvider !== null}
        onOpenChange={open => {
          if (!open) {
            setPreOauthProvider(null)
            setPreOauthMissingKeys([])
            setPreOauthSchema(null)
            setPreOauthValues({})
            setPreOauthErrors({})
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitlePrimitive>Connect {preOauthProvider}</DialogTitlePrimitive>
            <DialogDescription>This connector needs a bit of info before we can start OAuth.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {preOauthMissingKeys.map(key => {
              const prop = preOauthSchema?.properties?.[key]
              const label = (prop?.title as string) || key
              const desc = (prop?.description as string) || ''
              const placeholder = (Array.isArray(prop?.examples) && typeof prop.examples[0] === 'string' ? prop.examples[0] : '') || (typeof prop?.default === 'string' ? prop.default : '') || ''

              return (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor={`pre-oauth-${key}`}>
                    {label}
                  </label>
                  {desc ? <div className="text-xs text-muted-foreground">{desc}</div> : null}
                  <Input id={`pre-oauth-${key}`} value={preOauthValues[key] ?? ''} onChange={e => setPreOauthValues(prev => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} />
                  {preOauthErrors[key] ? <div className="text-xs text-destructive">{preOauthErrors[key]}</div> : null}
                </div>
              )
            })}
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setPreOauthProvider(null)} disabled={oauthMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await submitPreOauth()
                } catch (e: any) {
                  const errorMessage = e?.response?.data?.error?.message || e?.message || 'Please verify your inputs.'
                  toast.error('Failed to start OAuth', { description: errorMessage })
                }
              }}
              disabled={oauthMutation.isPending}
            >
              {oauthMutation.isPending ? 'Continuing…' : 'Next'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={apiKeyDialogProvider !== null} onOpenChange={open => !open && setApiKeyDialogProvider(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitlePrimitive>Connect with API key</DialogTitlePrimitive>
            <DialogDescription>{apiKeyDialogProvider ? `Enter an API key for ${getProviderLabel(apiKeyDialogProvider)}. This will be stored securely for this starship.` : null}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="api-key">
                API key
              </label>
              <Input id="api-key" value={apiKeyValue} onChange={e => setApiKeyValue(e.target.value)} placeholder="Paste your API key" type="password" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="api-key-extra-config">
                extraConfig (optional JSON object)
              </label>
              <Textarea
                id="api-key-extra-config"
                value={apiKeyExtraConfigText}
                onChange={e => setApiKeyExtraConfigText(e.target.value)}
                placeholder='e.g. { "accountId": "123" }'
                className="min-h-[120px] font-mono text-xs"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setApiKeyDialogProvider(null)} disabled={apiKeyMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await handleApiKeyConnect()
                } catch (e: any) {
                  toast.error('Failed to connect with API key', { description: e?.message || 'Please verify your inputs.' })
                }
              }}
              disabled={apiKeyMutation.isPending || !apiKeyValue.trim()}
            >
              {apiKeyMutation.isPending ? 'Connecting…' : 'Connect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={basicDialogProvider !== null} onOpenChange={open => !open && setBasicDialogProvider(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitlePrimitive>Connect with Basic auth</DialogTitlePrimitive>
            <DialogDescription>
              {basicDialogProvider ? `Enter credentials for ${getProviderLabel(basicDialogProvider)}. These will be stored securely for this starship.` : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="basic-username">
                Username / API key
              </label>
              <Input
                id="basic-username"
                value={basicUsernameValue}
                onChange={e => setBasicUsernameValue(e.target.value)}
                placeholder="API key or username"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="basic-password">
                Password (optional)
              </label>
              <Input
                id="basic-password"
                type="password"
                value={basicPasswordValue}
                onChange={e => setBasicPasswordValue(e.target.value)}
                placeholder="Leave empty if not required"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="basic-extra-config">
                extraConfig (optional JSON object)
              </label>
              <Textarea
                id="basic-extra-config"
                value={basicExtraConfigText}
                onChange={e => setBasicExtraConfigText(e.target.value)}
                placeholder='e.g. { "accountId": "123" }'
                className="min-h-[120px] font-mono text-xs"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setBasicDialogProvider(null)} disabled={basicMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await handleBasicConnect()
                } catch (e: any) {
                  toast.error('Failed to connect with Basic auth', { description: e?.message || 'Please verify your inputs.' })
                }
              }}
              disabled={basicMutation.isPending || !basicUsernameValue.trim()}
            >
              {basicMutation.isPending ? 'Connecting…' : 'Connect'}
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
