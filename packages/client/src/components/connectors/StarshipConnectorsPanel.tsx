'use client'

import Icon from '@/components/primitives/Icon'
import {
  useConnectApiKeyConnector,
  useConnectBasicAuthConnector,
  useConnectorCatalog,
  useDisconnectConnector,
  useInfiniteConnectorCatalog,
  useStarshipConnectors,
  useStartOAuthConnector,
} from '@/hooks/useConnectors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle as DialogTitlePrimitive } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { ConnectorLogo } from '@/components/marketplace/ConnectorLogo'

const CONNECTOR_CTA_BUTTON_CLASS =
  'h-9 px-3 font-medium transition-all duration-200 border border-transparent text-[rgba(245,158,11,0.8)] hover:text-[rgba(245,158,11,0.8)] hover:border-[rgba(245,158,11,0.25)] hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(251,191,36,0.06))] hover:shadow-[0_0_4px_rgba(245,158,11,0.10)] disabled:text-muted-foreground disabled:hover:text-muted-foreground disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none'
const CONNECTOR_CTA_ICON_CLASS = 'mr-1 h-4 w-4 text-[rgba(245,158,11,0.85)] group-disabled:text-muted-foreground'

interface StarshipConnectorsPanelProps {
  starshipId: string
  /**
   * Optional onboarding mode: show only a subset of connectors (by provider).
   */
  onlyProviders?: string[]
  /**
   * Back-compat: older callsites (onboarding) may pass this.
   * Search is now rendered by the parent page for connectors settings.
   */
  hideSearch?: boolean
  /** Optional server-side search query (catalog endpoint supports `q`). */
  catalogQuery?: string
  /**
   * When true, fetch the connector catalog via server pagination (page/limit).
   * Useful when the catalog is large and we don't want to load everything at once.
   */
  paginateCatalog?: boolean
  /** Page size for paginated catalog mode. */
  catalogPageSize?: number
  /** Optional callback to surface server catalog total (pagination.total). */
  onCatalogTotalChange?: (total: number | null) => void
  /** Limit the number of rendered connector rows/cards (UI-only). */
  maxItems?: number
  /** Sort order for rendered connectors. */
  sortBy?: 'catalog' | 'recently_used'
  /** Whether to show "Load more" when catalog is paginated. */
  showLoadMore?: boolean
  /** Filter which connectors to show. */
  statusFilter?: 'all' | 'connected' | 'unconnected'
  /**
   * Rendering style.
   * - grid: existing card grid (useful in onboarding/modals)
   * - list: members-like rows (used on connectors page)
   */
  layout?: 'grid' | 'list'
  /**
   * Hide disconnect UI (useful for onboarding).
   */
  hideDisconnect?: boolean
  /**
   * Max number of columns to render connector cards in the grid.
   * Defaults to 3 (current connectors page behavior).
   */
  maxColumns?: 1 | 2 | 3
  /**
   * Hide reconnect CTA when a connector is already connected.
   * Useful for onboarding flows where we only want to show status + disconnect.
   */
  hideReconnect?: boolean
  /** Hide description on each connector card (compact layout, e.g. deploy modal). */
  hideCardDescription?: boolean
  /** Override connect button label (e.g. "Connect" instead of "Connect Gmail"). */
  connectButtonLabel?: string
  /**
   * Visual density for grid cards.
   * - default: existing spacing (roomier)
   * - compact: match wizard "Automations" step 2 card density
   */
  density?: 'default' | 'compact'
  /**
   * Controls the visual style of connector cards in grid layout.
   * - panel: existing connectors/settings card design
   * - explore: match the public Explore connector listing card design
   */
  cardVariant?: 'panel' | 'explore'
  /**
   * Use the same card background/border as onboarding step 3 agent cards
   * (e.g. bg-card/10, border-border/40) for visual consistency.
   */
  matchAgentCardStyle?: boolean
  /**
   * Optional callback to surface connector counts to a parent header/subtitle.
   * `total` counts the visible catalog (after onlyProviders filter), and `connected`
   * counts how many of those are currently connected.
   */
  onStatsChange?: (stats: { total: number; connected: number }) => void
  /**
   * When false, disables entrance animations for cards (no motion wrappers).
   * Useful for wizard/modals where staggered animations feel distracting.
   */
  animateCards?: boolean
}

function toSafeConnectorLogoSlug(provider: string): string {
  // ConnectorProvider is an open string type; keep this conservative.
  // We currently ship SVG logos in `public/connectors/`.
  return String(provider)
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function getConnectorLogoSrc(provider: string): string {
  return `/connectors/${toSafeConnectorLogoSlug(provider)}.svg`
}

export function StarshipConnectorsPanel({
  starshipId,
  onlyProviders,
  hideSearch,
  catalogQuery,
  paginateCatalog = false,
  catalogPageSize = 24,
  onCatalogTotalChange,
  maxItems,
  sortBy = 'catalog',
  showLoadMore = true,
  statusFilter = 'all',
  layout = 'grid',
  hideDisconnect = false,
  maxColumns = 3,
  hideReconnect = false,
  hideCardDescription = false,
  connectButtonLabel,
  density = 'default',
  cardVariant = 'panel',
  matchAgentCardStyle = false,
  onStatsChange,
  animateCards = true,
}: StarshipConnectorsPanelProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const q = typeof catalogQuery === 'string' ? catalogQuery.trim() : ''
  const pagedCatalog = useInfiniteConnectorCatalog({ q, limit: catalogPageSize, enabled: paginateCatalog })
  const flatPagedCatalog = useMemo(() => {
    const pages = pagedCatalog.data?.pages ?? []
    return pages.flatMap(p => (Array.isArray(p?.connectors) ? p.connectors : []))
  }, [pagedCatalog.data])
  const pagedTotal = useMemo(() => {
    const pages = pagedCatalog.data?.pages ?? []
    for (let i = pages.length - 1; i >= 0; i--) {
      const t = (pages[i] as any)?.pagination?.total
      const n = typeof t === 'number' ? t : Number(t)
      if (Number.isFinite(n)) return n
    }
    return null
  }, [pagedCatalog.data])

  const { data: catalog = [], isFetching: isCatalogFetching } = useConnectorCatalog({ q, enabled: !paginateCatalog })
  const catalogItems = paginateCatalog ? flatPagedCatalog : catalog
  const isCatalogFetchingUnified = paginateCatalog ? pagedCatalog.isFetching : isCatalogFetching
  const canLoadMoreCatalog = paginateCatalog ? Boolean(pagedCatalog.hasNextPage) : false
  const isLoadingMoreCatalog = paginateCatalog ? Boolean(pagedCatalog.isFetchingNextPage) : false
  const { data: connectors = [], isLoading } = useStarshipConnectors(starshipId, !!starshipId)
  const disconnectMutation = useDisconnectConnector(starshipId)
  const oauthMutation = useStartOAuthConnector(starshipId)
  const apiKeyMutation = useConnectApiKeyConnector(starshipId)
  const basicMutation = useConnectBasicAuthConnector(starshipId)

  const [pendingDisconnect, setPendingDisconnect] = useState<string | null>(null)
  const [hiddenLogos, setHiddenLogos] = useState<Record<string, boolean>>({})
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
      const qs = searchParams?.toString() || ''
      const returnUrl = `${pathname}${qs ? `?${qs}` : ''}`
      const result = await oauthMutation.mutateAsync({ provider: provider as any, returnUrl } as any)
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

    const qs = searchParams?.toString() || ''
    const returnUrl = `${pathname}${qs ? `?${qs}` : ''}`
    const result = await oauthMutation.mutateAsync({
      provider: preOauthProvider as any,
      metadata: Object.fromEntries(Object.entries(preOauthValues).map(([k, v]) => [k, v.trim()])),
      returnUrl,
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

  // Catalog is driven by connector_templates (enabled only). UI adapts actions based on auth.type.
  const visibleCatalog = useMemo(() => {
    const base = (catalogItems || []).filter(item => item.provider !== 'starships')
    if (Array.isArray(onlyProviders) && onlyProviders.length > 0) {
      const allow = new Set(onlyProviders.map(p => String(p)))
      return base.filter(item => allow.has(String(item.provider)))
    }
    return base
  }, [catalogItems, onlyProviders])

  const connectedProviderSet = useMemo(() => {
    return new Set((connectors ?? []).filter(c => (c as any)?.status === 'connected').map(c => String((c as any)?.provider)))
  }, [connectors])

  const connectedCount = useMemo(() => {
    const providerSet = new Set(visibleCatalog.map(c => String(c.provider)))
    const connectedProviders = new Set(
      (connectors ?? [])
        .filter(c => providerSet.has(String((c as any)?.provider)) && (c as any)?.status === 'connected')
        .map(c => String((c as any)?.provider))
    )
    return connectedProviders.size
  }, [connectors, visibleCatalog])

  const filteredCatalog = useMemo(() => {
    if (statusFilter === 'connected') return visibleCatalog.filter(c => connectedProviderSet.has(String(c.provider)))
    if (statusFilter === 'unconnected') return visibleCatalog.filter(c => !connectedProviderSet.has(String(c.provider)))
    return visibleCatalog
  }, [connectedProviderSet, statusFilter, visibleCatalog])

  const renderedCatalog = useMemo(() => {
    const base = Array.isArray(filteredCatalog) ? [...filteredCatalog] : []
    if (sortBy === 'recently_used') {
      base.sort((a, b) => {
        const ap = String((a as any)?.provider || '').trim()
        const bp = String((b as any)?.provider || '').trim()
        const aState: any = getConnectorState(ap)
        const bState: any = getConnectorState(bp)
        const aTsRaw = aState?.updatedAt || aState?.createdAt || null
        const bTsRaw = bState?.updatedAt || bState?.createdAt || null
        const aTs = typeof aTsRaw === 'string' ? new Date(aTsRaw).getTime() : 0
        const bTs = typeof bTsRaw === 'string' ? new Date(bTsRaw).getTime() : 0
        if (aTs !== bTs) return bTs - aTs
        return ap.localeCompare(bp)
      })
    }
    const n = typeof maxItems === 'number' && Number.isFinite(maxItems) ? Math.max(0, Math.floor(maxItems)) : null
    return n != null ? base.slice(0, n) : base
  }, [filteredCatalog, getConnectorState, maxItems, sortBy])

  const lastStatsRef = useRef<{ total: number; connected: number } | null>(null)
  useEffect(() => {
    if (!onStatsChange) return
    const next = { total: visibleCatalog.length, connected: connectedCount }
    const prev = lastStatsRef.current
    if (prev && prev.total === next.total && prev.connected === next.connected) return
    lastStatsRef.current = next
    onStatsChange(next)
  }, [connectedCount, onStatsChange, visibleCatalog.length])

  const getProviderLabel = (provider: string | null | undefined) => {
    if (!provider) return ''
    return visibleCatalog.find((c: { provider: string }) => c.provider === provider)?.name ?? provider
  }

  const isSearching = Boolean(q) && isCatalogFetchingUnified
  const isInitialCatalogLoading = !q && isCatalogFetchingUnified && catalogItems.length === 0
  const isPanelLoading = isLoading || isInitialCatalogLoading

  const lastCatalogTotalRef = useRef<number | null>(null)
  useEffect(() => {
    if (!onCatalogTotalChange) return
    const next = paginateCatalog ? pagedTotal : visibleCatalog.length
    if (lastCatalogTotalRef.current === next) return
    lastCatalogTotalRef.current = next
    onCatalogTotalChange(next)
  }, [onCatalogTotalChange, paginateCatalog, pagedTotal, visibleCatalog.length])

  const renderConnectorRowSkeleton = (key: string) => {
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1')}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <Skeleton className="h-[22px] w-[22px] rounded-md" />
              </span>
              {/* Presence dot placeholder (match `PresenceIndicator` placement + connectors row offsets). */}
              <span className="absolute bottom-0 right-0 translate-x-[22%] translate-y-[6%] z-50 pointer-events-none">
                <Skeleton className="h-2 w-2 rounded-full ring-2 ring-background outline outline-1 outline-border" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40 max-w-[70%]" />
                <Skeleton className="h-4 w-14 rounded-md" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 self-center">
          <Skeleton className="h-8 min-w-[130px] rounded-2xl" />
        </div>
      </div>
    )
  }

  const renderCenteredState = (message: string) => {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-muted-foreground text-center">{message}</p>
      </div>
    )
  }

  if (isPanelLoading && layout === 'list') {
    return (
      <div>
        <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => renderConnectorRowSkeleton(`connector-skel-${i}`))}</div>
      </div>
    )
  }

  if (isPanelLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground text-sm">Loading connectors...</p>
      </div>
    )
  }

  const renderConnectorCard = (provider: string) => {
    const catalogItem = visibleCatalog.find((c: { provider: string }) => c.provider === provider)
    if (!catalogItem) return null

    const state = getConnectorState(provider)
    const isConnected = state?.status === 'connected'

    const label = catalogItem.name
    const logoSrc = getConnectorLogoSrc(provider)
    const authType = catalogItem.auth?.type
    const canDisconnect = !hideDisconnect && isConnected && authType !== 'platform_jwt'
    const isOauthConnectable = authType === 'oauth2'
    const isApiKeyConnectable = authType === 'api_key'
    const isBasicConnectable = authType === 'basic'
    const isManaged = authType === 'platform_jwt'
    const showLogo = !!provider && !hiddenLogos[provider]

    const shouldHideConnectButton = hideReconnect && isConnected && isOauthConnectable

    if (cardVariant === 'explore') {
      const compact = density === 'compact'
      const exploreConnectButton = (
        <Button
          variant={isConnected ? 'ghost' : 'ghost'}
          size="sm"
          disabled={
            oauthMutation.isPending ||
            apiKeyMutation.isPending ||
            basicMutation.isPending ||
            isManaged ||
            (!isOauthConnectable && !isApiKeyConnectable && !isBasicConnectable) ||
            isConnected
          }
          onClick={() => {
            if (isConnected) return
            if (isManaged) return
            if (isOauthConnectable) return void handleConnect(provider)
            if (isApiKeyConnectable) return openApiKeyDialog(provider)
            if (isBasicConnectable) return openBasicDialog(provider)
          }}
          className={cn(
            'h-7 px-2 shrink-0 text-xs',
            isConnected
              ? 'text-emerald-700 dark:text-emerald-300 opacity-100'
              : 'text-primary hover:text-primary disabled:text-muted-foreground'
          )}
        >
          {isConnected ? (
            <>
              <Icon name="check-circle" className="h-3.5 w-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
              Connected
            </>
          ) : isManaged ? (
            'Managed by platform'
          ) : (
            (connectButtonLabel ?? 'Connect')
          )}
        </Button>
      )

      const exploreDisconnectButton = canDisconnect ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openDisconnectConfirm(provider)}
          disabled={disconnectMutation.isPending}
          className="h-7 px-2 shrink-0 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          Disconnect
        </Button>
      ) : null

      if (compact) {
        const CardShell = (
          <div className="group relative rounded-lg border border-border/60 bg-card/10 p-3 transition-colors hover:bg-card/15">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {provider && showLogo ? (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white border border-border/40 overflow-hidden" title={provider || label}>
                      <ConnectorLogo provider={provider} className="h-4 w-4 object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white border border-border/40 text-muted-foreground" title="Connector">
                      <Icon name="plug" className="h-3.5 w-3.5" />
                    </div>
                  )}

                  <div className="text-sm font-semibold leading-tight text-foreground truncate">{label}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {exploreDisconnectButton}
                  {!shouldHideConnectButton ? exploreConnectButton : null}
                </div>
              </div>

              {!hideCardDescription && catalogItem.description ? (
                <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{catalogItem.description}</div>
              ) : null}
            </div>
          </div>
        )

        return animateCards ? (
          <motion.div key={provider} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className="h-full">
            {CardShell}
          </motion.div>
        ) : (
          <div key={provider} className="h-full">
            {CardShell}
          </div>
        )
      }

      const DefaultExploreShell = (
        <div className="group relative overflow-hidden h-full flex flex-col rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm transition-all duration-200 hover:shadow-md">
          <div className="flex">
            {/* Left logo strip (edge-to-edge), matching Explore listing */}
            <div className="relative w-20 shrink-0 overflow-hidden bg-transparent">
              <div className="absolute inset-0 flex items-center justify-center">
                {provider ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-border/40 overflow-hidden" title={provider || label}>
                    <ConnectorLogo provider={provider} className="h-6 w-6 object-contain" />
                  </div>
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-border/40 text-muted-foreground" title="Connector">
                    <Icon name="plug" className="h-4.5 w-4.5" />
                  </div>
                )}
              </div>
            </div>

            {/* Right content */}
            <div className="min-w-0 flex-1 flex flex-col py-4 pr-4 pl-0">
              <div className="min-w-0">
                <div className="text-base font-semibold leading-tight truncate">{label}</div>
              </div>

              {!hideCardDescription && catalogItem.description ? (
                <div className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">{catalogItem.description}</div>
              ) : null}

              <div className="mt-auto pt-3 flex items-center justify-end gap-2">
                {exploreDisconnectButton}
                {!shouldHideConnectButton ? exploreConnectButton : null}
              </div>
            </div>
          </div>
        </div>
      )

      return animateCards ? (
        <motion.div key={provider} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className="h-full">
          {DefaultExploreShell}
        </motion.div>
      ) : (
        <div key={provider} className="h-full">
          {DefaultExploreShell}
        </div>
      )
    }

    const connectButton = (
      <Button
        size="sm"
        variant="ghost"
        className={`${CONNECTOR_CTA_BUTTON_CLASS} group min-w-[140px] justify-center shrink-0`}
        onClick={() => {
          if (isManaged) return
          if (isOauthConnectable) return void handleConnect(provider)
          if (isApiKeyConnectable) return openApiKeyDialog(provider)
          if (isBasicConnectable) return openBasicDialog(provider)
        }}
        disabled={oauthMutation.isPending || apiKeyMutation.isPending || basicMutation.isPending || isManaged || (!isOauthConnectable && !isApiKeyConnectable && !isBasicConnectable)}
      >
        <Icon name={isConnected ? 'repeat' : 'plug'} className={CONNECTOR_CTA_ICON_CLASS} />
        {isManaged
          ? 'Managed by platform'
          : isOauthConnectable
            ? isConnected
              ? connectButtonLabel ?? `Connect ${label}`
              : (connectButtonLabel ?? `Connect ${label}`)
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
    )

    const disconnectButton = canDisconnect ? (
      <Button
        size="sm"
        variant="outline"
        className="min-w-[140px] shrink-0 hover:border-destructive/60 hover:text-destructive hover:bg-destructive/10"
        onClick={() => openDisconnectConfirm(provider)}
        disabled={disconnectMutation.isPending}
      >
        Disconnect
      </Button>
    ) : null

    const cardClassName = matchAgentCardStyle
      ? 'group relative overflow-hidden h-full flex flex-col rounded-xl border border-border/40 bg-card/10 transition-colors duration-200 hover:bg-card/15'
      : 'group relative overflow-hidden h-full flex flex-col rounded-xl bg-slate-100/50 dark:bg-zinc-800/35 border border-slate-200/50 dark:border-zinc-600/30 shadow-sm dark:shadow-black/5 transition-colors duration-200 hover:bg-slate-100/70 dark:hover:bg-zinc-800/50 hover:border-slate-200/70 dark:hover:border-zinc-600/45'

    return (
      <motion.div key={provider} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className="h-full">
        <Card className={cn(cardClassName)}>
          <CardHeader className={hideCardDescription ? 'py-4 px-5 relative z-10' : 'pb-3 relative z-10 pt-5 space-y-3'}>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-3 min-w-0">
                {showLogo && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white shadow-sm border border-border/40">
                    <Image src={logoSrc} alt={`${label} logo`} width={24} height={24} onError={() => setHiddenLogos(prev => ({ ...prev, [provider]: true }))} />
                  </div>
                )}
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-lg leading-tight truncate">{label}</span>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-slate-400'}`} />
                    <span className={isConnected ? 'text-slate-600 dark:text-slate-400' : 'text-muted-foreground'}>{isConnected ? 'Connected' : 'Not connected'}</span>
                  </div>
                </div>
              </CardTitle>
              {hideCardDescription ? (
                <div className="flex items-center gap-2 shrink-0">
                  {!shouldHideConnectButton && connectButton}
                  {disconnectButton}
                </div>
              ) : null}
            </div>
            {!hideCardDescription && <p className="text-sm text-muted-foreground">{catalogItem.description}</p>}
          </CardHeader>
          {!hideCardDescription && (
            <CardContent className="relative z-10 pt-0 pb-5 mt-auto">
              <div className="flex gap-2 justify-end">
                {!shouldHideConnectButton && connectButton}
                {disconnectButton}
              </div>
            </CardContent>
          )}
        </Card>
      </motion.div>
    )
  }

  const gapClassName = density === 'compact' ? 'gap-3' : 'gap-6'
  const gridClassName =
    maxColumns === 1 ? `grid ${gapClassName} grid-cols-1` : maxColumns === 2 ? `grid ${gapClassName} grid-cols-1 md:grid-cols-2` : `grid ${gapClassName} md:grid-cols-2 lg:grid-cols-3`

  const listRow = (provider: string) => {
    const catalogItem = visibleCatalog.find((c: { provider: string }) => c.provider === provider)
    if (!catalogItem) return null

    const state = getConnectorState(provider)
    const isConnected = state?.status === 'connected'

    const label = catalogItem.name
    const logoSrc = getConnectorLogoSrc(provider)
    const authType = catalogItem.auth?.type
    const canDisconnect = !hideDisconnect && isConnected && authType !== 'platform_jwt'
    const isOauthConnectable = authType === 'oauth2'
    const isApiKeyConnectable = authType === 'api_key'
    const isBasicConnectable = authType === 'basic'
    const isManaged = authType === 'platform_jwt'
    const showLogo = !!provider && !hiddenLogos[provider]

    const shouldHideConnectButton = hideReconnect && isConnected && isOauthConnectable

    const connectButton = (
      <Button
        size="sm"
        variant="ghost"
        className={cn(CONNECTOR_CTA_BUTTON_CLASS, 'h-8 group min-w-[130px] justify-center shrink-0')}
        onClick={() => {
          if (isManaged) return
          if (isOauthConnectable) return void handleConnect(provider)
          if (isApiKeyConnectable) return openApiKeyDialog(provider)
          if (isBasicConnectable) return openBasicDialog(provider)
        }}
        disabled={oauthMutation.isPending || apiKeyMutation.isPending || basicMutation.isPending || isManaged || (!isOauthConnectable && !isApiKeyConnectable && !isBasicConnectable)}
      >
        <Icon name={isConnected ? 'repeat' : 'plug'} className={CONNECTOR_CTA_ICON_CLASS} />
        {isManaged ? 'Managed by platform' : (connectButtonLabel ?? 'Connect')}
      </Button>
    )

    const disconnectButton = canDisconnect ? (
      <Button
        size="sm"
        variant="ghost"
        className="h-8 min-w-[130px] shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive justify-center"
        onClick={() => openDisconnectConfirm(provider)}
        disabled={disconnectMutation.isPending}
      >
        Disconnect
      </Button>
    ) : null

    const cta = isConnected ? disconnectButton ?? connectButton : connectButton

    return (
      <div key={provider} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1')} aria-label={label}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                {showLogo ? (
                  <Image src={logoSrc} alt={`${label} logo`} width={22} height={22} onError={() => setHiddenLogos(prev => ({ ...prev, [provider]: true }))} />
                ) : (
                  <Icon name="plug" className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
              <PresenceIndicator
                kind={isConnected ? 'online' : 'offline'}
                active={true}
                size="sm"
                placement="outset"
                // Match Members page placement for 40px avatar.
                className="translate-x-[22%] translate-y-[6%]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-medium truncate text-foreground')}>{label}</span>
                <span
                  className={cn(
                    'inline-flex items-center whitespace-nowrap h-4 rounded-md border px-1.5 text-[9px] font-medium leading-none shrink-0',
                    isConnected
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-border/50 bg-muted/20 text-muted-foreground'
                  )}
                  aria-label={isConnected ? 'Connected' : 'Not connected'}
                  title={isConnected ? 'Connected' : 'Not connected'}
                >
                  {isConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate">{catalogItem.description}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-center">
          {!shouldHideConnectButton ? cta : null}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {layout === 'list' ? (
        <div>
          {isSearching ? (
            renderCenteredState(`Searching “${q}”…`)
          ) : renderedCatalog.length === 0 ? (
            renderCenteredState(q ? `No connectors match “${q}”.` : 'No connectors available.')
          ) : (
            <div className="space-y-2">{renderedCatalog.map(entry => listRow(entry.provider))}</div>
          )}
          {paginateCatalog && showLoadMore && canLoadMoreCatalog ? (
            <div className="flex justify-center pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  void pagedCatalog.fetchNextPage()
                }}
                disabled={isLoadingMoreCatalog}
                className="h-8"
              >
                {isLoadingMoreCatalog ? 'Loading…' : 'Load more connectors'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {isSearching ? (
            renderCenteredState(`Searching “${q}”…`)
          ) : filteredCatalog.length === 0 ? (
            renderCenteredState(q ? `No connectors match “${q}”.` : 'No connectors available.')
          ) : null}
          <div className={gridClassName}>{renderedCatalog.map(entry => renderConnectorCard(entry.provider))}</div>
          {paginateCatalog && showLoadMore && canLoadMoreCatalog ? (
            <div className="flex justify-center pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  void pagedCatalog.fetchNextPage()
                }}
                disabled={isLoadingMoreCatalog}
                className="h-8"
              >
                {isLoadingMoreCatalog ? 'Loading…' : 'Load more connectors'}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {!hideDisconnect ? (
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
      ) : null}

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
            <DialogDescription>{basicDialogProvider ? `Enter credentials for ${getProviderLabel(basicDialogProvider)}. These will be stored securely for this starship.` : null}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="basic-username">
                Username / API key
              </label>
              <Input id="basic-username" value={basicUsernameValue} onChange={e => setBasicUsernameValue(e.target.value)} placeholder="API key or username" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="basic-password">
                Password (optional)
              </label>
              <Input id="basic-password" type="password" value={basicPasswordValue} onChange={e => setBasicPasswordValue(e.target.value)} placeholder="Leave empty if not required" />
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
