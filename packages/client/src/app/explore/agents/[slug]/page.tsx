import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import type { AgentTemplateModel, ConnectorCatalogItem, ToolTemplateModel } from '@starships/protocol'

import { fetchPublicAgentTemplateBySlug, fetchPublicConnectorCatalog, fetchPublicToolTemplates } from '@/lib/server/public-templates'
import PublicHeader from '@/components/navigation/PublicHeader'
import Icon from '@/components/primitives/Icon'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'
import { MarketplaceAgentMarketingFab } from '@/components/marketplace/MarketplaceAgentMarketingFab'
import { ConnectorLogo } from '@/components/marketplace/ConnectorLogo'

import { MarketplaceAgentDeployCta } from '@/app/marketplace/agents/MarketplaceAgentDeployCta'
import { MarketplaceShareLinkCard } from '@/app/marketplace/agents/MarketplaceShareLinkCard'
import { AgentProfileImage } from '@/components/marketplace/AgentProfileImage'
import { PublicFooter } from '@/app/components/PublicFooter'
import ExploreCTA from '@/app/components/ExploreCTA'

// Public marketing page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const dynamicParams = true
export const revalidate = 3600 // 1 hour

type PageProps = {
  params: Promise<{ slug: string }>
}

function normalizeSlug(value: unknown): string {
  return String(value ?? '').trim()
}

function safeSocialImageUrl(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback

  // Allow same-origin relative paths.
  if (raw.startsWith('/')) return raw

  // Only allow http(s) absolute URLs. (Avoid javascript:, data:, etc.)
  try {
    const u = new URL(raw)
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString()
  } catch {
    // ignore
  }
  return fallback
}

function categoryBadgeClass(category: AgentTemplateModel['category']): string {
  const colors: Record<string, string> = {
    general: 'bg-gradient-to-r from-gray-500/10 to-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
    automation: 'bg-gradient-to-r from-green-500/10 to-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
    data: 'bg-gradient-to-r from-purple-500/10 to-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
    communication: 'bg-gradient-to-r from-orange-500/10 to-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
    coding: 'bg-gradient-to-r from-indigo-500/10 to-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    creative: 'bg-gradient-to-r from-pink-500/10 to-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30',
    analysis: 'bg-gradient-to-r from-cyan-500/10 to-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
    support: 'bg-gradient-to-r from-amber-500/10 to-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
    utility: 'bg-gradient-to-r from-teal-500/10 to-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30',
  }
  return colors[String(category)] || colors.general
}

type CapabilityPermission = 'allow' | 'ask' | 'deny'

function inferCapabilityPermission(info: ToolTemplateModel | undefined): CapabilityPermission {
  // Marketplace pages have no starship-specific permission matrix.
  // We infer a conservative "ask" when a tool clearly requires user configuration.
  if (!info) return 'allow'
  if (info.requiresApiKey) return 'ask'
  const requiredConfigCount = Array.isArray(info.configurationFields) ? info.configurationFields.filter(f => !!f?.required).length : 0
  if (requiredConfigCount > 0) return 'ask'
  return 'allow'
}

function permissionDotClassName(p: CapabilityPermission): string {
  if (p === 'allow') return 'bg-emerald-500'
  if (p === 'ask') return 'bg-amber-500'
  return 'bg-red-500'
}

const NAV_CARD_CLASS = 'rounded-lg border border-border/60 bg-card shadow-sm'
const SECTION_TITLE_CLASS = 'text-sm font-semibold tracking-tight text-foreground'
const SECTION_SUBTITLE_CLASS = 'text-xs text-muted-foreground'

function agentSubjectLabel(name: string): string {
  const n = String(name || '').trim()
  if (!n) return 'This agent'
  return n
}

function titleCase(input: string): string {
  const s = String(input || '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function getTemplateBySlug(slug: string): Promise<AgentTemplateModel | null> {
  return await fetchPublicAgentTemplateBySlug({ slug, revalidateSeconds: revalidate })
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = await props.params
  const s = normalizeSlug(slug)
  const template = s ? await getTemplateBySlug(s) : null

  if (!template) {
    return {
      title: 'Agent not found | Explore | Starships.ai',
      description: 'This agent doesn’t exist (or is no longer published).',
      alternates: { canonical: 'https://starships.ai/explore' },
    }
  }

  const title = `${template.name} | Explore | Starships.ai`
  const description = template.description || `Learn more about ${template.name} in Explore on Starships.ai.`
  const url = `https://starships.ai/explore/agents/${encodeURIComponent(template.slug)}`
  const imageUrl = safeSocialImageUrl(template.avatarUrl, '/static-assets/og.jpg')

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: 'Starships.ai',
      title,
      description,
      url,
      locale: 'en_US',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: template.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function ExploreAgentDetailsPage(props: PageProps) {
  const { slug } = await props.params
  const s = normalizeSlug(slug)
  if (!s) notFound()

  const template = await getTemplateBySlug(s)
  if (!template) notFound()

  const toolTemplates = await fetchPublicToolTemplates({ revalidateSeconds: revalidate })
  const connectorCatalog = await fetchPublicConnectorCatalog({ revalidateSeconds: revalidate })
  const toolInfoBySlug = new Map<string, ToolTemplateModel>()
  for (const t of toolTemplates) {
    if (typeof t?.slug !== 'string') continue
    const full = t.slug.trim()
    if (!full) continue
    toolInfoBySlug.set(full.toLowerCase(), t)

    // Back-compat: some agent templates store "base slugs" without the always-on
    // random suffix (e.g. "gmail" vs "gmail-a1b2"). Index both to make marketplace
    // lookups (descriptions/connectors) reliable.
    const base = full.replace(/-[a-z0-9]{4}$/i, '')
    const baseKey = base.trim().toLowerCase()
    if (baseKey && baseKey !== full.toLowerCase() && !toolInfoBySlug.has(baseKey)) {
      toolInfoBySlug.set(baseKey, t)
    }
  }

  const connectorInfoByProvider = new Map<string, ConnectorCatalogItem>()
  for (const c of connectorCatalog) {
    const key = typeof (c as any)?.provider === 'string' ? String((c as any).provider).trim().toLowerCase() : ''
    if (key) connectorInfoByProvider.set(key, c)
  }

  const toolSlugs = Array.isArray(template.assignedToolSlugs) ? template.assignedToolSlugs.filter(s2 => typeof s2 === 'string' && s2.trim().length > 0) : []
  const shareUrl = `https://starships.ai/explore/agents/${encodeURIComponent(template.slug)}`

  // Profile image URLs from template (API routes)
  const problemStatementsImageUrl = template.problemStatementsImageUrl
  const capabilitiesImageUrl = template.capabilitiesImageUrl
  const tryThesePromptsImageUrl = template.tryThesePromptsImageUrl
  const problemStatementsText = Array.isArray(template.problemStatementsText) ? template.problemStatementsText : []
  const previewPrompts = Array.isArray(template.previewPrompts) ? template.previewPrompts : []

  const hasProblemText = problemStatementsText.length > 0
  // Images are shown in the dedicated "Screenshots" section; this section is text-only.
  const hasProblemSection = hasProblemText

  const hasCapabilitiesSection = toolSlugs.length > 0

  const hasTryPrompts = previewPrompts.length > 0

  const marketplaceMarketingRenderingDisabled = Boolean(template.marketplaceMarketingRenderingDisabled)

  const screenshots = [
    problemStatementsImageUrl
      ? {
          key: 'problem',
          label: 'Problems',
          src: problemStatementsImageUrl as string,
          alt: `${template.name} screenshots: the problems it solves`,
        }
      : null,
    capabilitiesImageUrl
      ? {
          key: 'capabilities',
          label: 'Capabilities',
          src: capabilitiesImageUrl as string,
          alt: `${template.name} screenshots: capabilities`,
        }
      : null,
    tryThesePromptsImageUrl
      ? {
          key: 'prompts',
          label: 'Prompts',
          src: tryThesePromptsImageUrl as string,
          alt: `${template.name} screenshots: example prompts`,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; src: string; alt: string }>

  const hasScreenshotsSection = screenshots.length > 0

  const requiredConnectorProviders = Array.from(
    new Set(
      toolSlugs
        .flatMap(slugv => toolInfoBySlug.get(String(slugv).trim().toLowerCase())?.requiredConnectorProviders ?? [])
        .filter(p => typeof p === 'string' && p.trim().length > 0)
        .map(p => p.trim())
    )
  )

  const toolsRequiringSetup = toolSlugs
    .map(slugv => {
      const info = toolInfoBySlug.get(String(slugv).trim().toLowerCase())
      if (!info) return null
      const requiresApiKey = Boolean(info.requiresApiKey)
      const requiredConfigCount = Array.isArray(info.configurationFields) ? info.configurationFields.filter(f => !!f?.required).length : 0
      const requiresConfig = requiredConfigCount > 0
      if (!requiresApiKey && !requiresConfig) return null
      const connectors = Array.from(
        new Set(
          (info?.requiredConnectorProviders ?? [])
            .filter(p => typeof p === 'string' && p.trim().length > 0)
            .map(p => p.trim().toLowerCase())
            .filter(p => p)
        )
      )
      return {
        slug: slugv,
        name: info.name?.trim() || String(slugv),
        requiresApiKey,
        requiresConfig,
        connectors,
      }
    })
    .filter(Boolean) as Array<{ slug: string; name: string; requiresApiKey: boolean; requiresConfig: boolean; connectors: string[] }>

  const capabilityItems = toolSlugs
    .map(slugv => {
      const info = toolInfoBySlug.get(String(slugv).trim().toLowerCase())
      const title = info?.name?.trim() || String(slugv)
      const desc = info?.description?.trim() || ''
      const templateDefault = (template.assignedToolDefaultPermissions?.[String(slugv)] ?? undefined) as CapabilityPermission | undefined
      const permission = templateDefault ?? inferCapabilityPermission(info)
      const connectors = Array.from(
        new Set(
          (info?.requiredConnectorProviders ?? [])
            .filter(p => typeof p === 'string' && p.trim().length > 0)
            .map(p => p.trim().toLowerCase())
            .filter(p => p)
        )
      )
      return { slug: String(slugv), title, desc, permission, connectors }
    })
    .filter(x => typeof x.slug === 'string' && x.slug.trim().length > 0)

  const capabilityGroups: Record<CapabilityPermission, typeof capabilityItems> = {
    allow: capabilityItems.filter(i => i.permission === 'allow'),
    ask: capabilityItems.filter(i => i.permission === 'ask'),
    deny: capabilityItems.filter(i => i.permission === 'deny'),
  }

  return (
    <>
      <div className="relative z-10">
        <PublicHeader />

        <main className="marketplace-agent-main pt-6 sm:pt-8">
          <div className="relative">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              {/* Breadcrumb */}
              <div className="pt-2 sm:pt-0 flex items-center gap-2 text-xs text-muted-foreground">
                <a href="/explore" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <Icon name="arrow-left" className="h-3.5 w-3.5" iconOverride={{ type: 'phosphor', component: 'ArrowLeft' }} />
                  <span>Explore</span>
                </a>
                <span className="opacity-60">/</span>
                <span className="text-foreground/80 truncate max-w-[40ch]">{template.name}</span>
              </div>

              {/* Hero header */}
              <section className="mt-4 sm:mt-6 mb-10 sm:mb-12">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <MarketplaceAvatar
                      imageUrl={template.avatarUrl || null}
                      label={`${template.name || 'Agent'} avatar`}
                      seed={template.name || template.slug || 'AI'}
                      sizeClassName="h-24 w-24 sm:h-28 sm:w-28"
                      fallbackTextClassName="text-lg sm:text-xl font-semibold text-muted-foreground"
                    />

                    <div className="min-w-0 flex-1">
                      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight truncate max-w-[38ch]">{template.name}</h1>
                      {template.role ? <div className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2 max-w-[72ch]">{template.role}</div> : null}

                      {template.description ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground max-w-[72ch]">{template.description}</p> : null}
                    </div>
                  </div>

                  {/* Action buttons at extreme right */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <MarketplaceAgentDeployCta template={template} />
                    <MarketplaceShareLinkCard shareUrl={shareUrl} compact />
                  </div>
                </div>

                {/* Badges below description (swapped order) */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {template.category ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-none capitalize ${categoryBadgeClass(template.category)}`}
                    >
                      {template.category}
                    </span>
                  ) : null}
                  {template.version ? (
                    <span className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[11px] font-semibold leading-none font-mono">
                      v{template.version}
                    </span>
                  ) : null}
                  {typeof template.usageCount === 'number' ? (
                    <span className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground">
                      {template.usageCount.toLocaleString()} deployments
                    </span>
                  ) : null}
                  {template.model ? (
                    <span className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[11px] font-semibold leading-none font-mono">
                      {template.model}
                    </span>
                  ) : null}
                </div>
              </section>

              {/* Main content grid */}
              <section className="mt-8 pb-10 sm:pb-16">
                <div className="space-y-16 sm:space-y-20">
                  {hasCapabilitiesSection ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                      {/* Capabilities */}
                      <section className={`space-y-10 ${marketplaceMarketingRenderingDisabled ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
                        {(
                          [
                            { key: 'allow' as const, permissionLabel: 'Always allow' },
                            { key: 'ask' as const, permissionLabel: 'Ask first' },
                            { key: 'deny' as const, permissionLabel: 'Never' },
                          ] as const
                        )
                          .map(meta => ({ ...meta, items: capabilityGroups[meta.key] }))
                          .filter(g => Array.isArray(g.items) && g.items.length > 0)
                          .map(group => (
                            <section key={group.key} className="space-y-4">
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${permissionDotClassName(group.key)}`} aria-hidden />
                                <h2 className={SECTION_TITLE_CLASS}>
                                  {group.key === 'allow'
                                    ? `${agentSubjectLabel(template.name)} can use`
                                    : group.key === 'ask'
                                      ? `${agentSubjectLabel(template.name)} will ask before using`
                                      : `${agentSubjectLabel(template.name)} can’t use`}
                                </h2>
                                {group.key === 'deny' ? <span className={SECTION_SUBTITLE_CLASS}>(can be changed after deploy)</span> : null}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {group.items.map(item => (
                                  <div key={item.slug} className={`group relative ${NAV_CARD_CLASS} p-4`}>
                                    <div className="flex items-start gap-3">
                                      {Array.isArray(item.connectors) && item.connectors.length > 0 ? (
                                        <div className="relative mt-0.5 flex-shrink-0">
                                          <div
                                            className="h-8 w-8 rounded-md border border-border/60 bg-white flex items-center justify-center overflow-hidden"
                                            title={connectorInfoByProvider.get(String(item.connectors[0]).toLowerCase())?.name?.trim() || titleCase(item.connectors[0])}
                                            aria-label={connectorInfoByProvider.get(String(item.connectors[0]).toLowerCase())?.name?.trim() || titleCase(item.connectors[0])}
                                          >
                                            <ConnectorLogo provider={item.connectors[0]} className="h-5 w-5" />
                                          </div>
                                          {item.connectors.length > 1 ? (
                                            <span className="absolute -bottom-1 -right-1 rounded-full border border-border/60 bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground shadow-sm">
                                              +{item.connectors.length - 1}
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : null}

                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold leading-5 text-foreground">{item.title}</div>
                                        {item.desc ? <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-1">{item.desc}</div> : null}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))}
                      </section>

                      {/* Connectors / setup (styled to match Capabilities cards) */}
                      <div className={`space-y-10 ${marketplaceMarketingRenderingDisabled ? 'lg:col-span-3' : 'lg:col-span-1'}`}>
                        {!marketplaceMarketingRenderingDisabled ? (
                          <section className="space-y-4">
                            <div className="flex items-center gap-2">
                              <h2 className={SECTION_TITLE_CLASS}>Connectors required</h2>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                              {requiredConnectorProviders.length > 0 ? (
                                requiredConnectorProviders.map(p => (
                                  <div key={p} className={`group relative ${NAV_CARD_CLASS} p-4`}>
                                    <div className="flex items-start gap-3">
                                      <div className="mt-0.5 flex-shrink-0">
                                        <div className="h-8 w-8 rounded-md border border-border/60 bg-white flex items-center justify-center overflow-hidden">
                                          <ConnectorLogo provider={p} className="h-5 w-5" />
                                        </div>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold leading-5 text-foreground">
                                          {connectorInfoByProvider.get(String(p).toLowerCase())?.name?.trim() || titleCase(p)}
                                        </div>
                                        <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                                          {connectorInfoByProvider.get(String(p).toLowerCase())?.description?.trim() || `Connect ${titleCase(p)} to enable this agent’s tools.`}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className={`group relative ${NAV_CARD_CLASS} p-4`}>
                                  <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex-shrink-0">
                                      <div className="h-8 w-8 rounded-md border border-border/60 bg-white flex items-center justify-center overflow-hidden">
                                        <Icon name="check-circle" className="h-5 w-5 text-emerald-600" />
                                      </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-semibold leading-5 text-foreground">None</div>
                                      <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">No connectors required for this agent.</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </section>
                        ) : null}

                        {toolsRequiringSetup.length > 0 ? (
                          <section className="space-y-4">
                            <div className="flex items-center gap-2">
                              <h2 className={SECTION_TITLE_CLASS}>Setup required</h2>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {toolsRequiringSetup.map(t => (
                                <div key={t.slug} className={`group relative ${NAV_CARD_CLASS} p-4`}>
                                  <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex-shrink-0">
                                      <div className="h-2 w-2 rounded-full bg-amber-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-semibold leading-5 text-foreground">{t.name}</div>
                                      <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                                        {t.requiresApiKey && t.requiresConfig
                                          ? 'Requires an API key and additional configuration.'
                                          : t.requiresApiKey
                                            ? 'Requires an API key.'
                                            : 'Requires configuration.'}
                                      </div>

                                      {Array.isArray(t.connectors) && t.connectors.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                          {t.connectors.slice(0, 6).map(p => (
                                            <div
                                              key={p}
                                              className="h-6 w-6 rounded-md border border-border/60 bg-white flex items-center justify-center overflow-hidden"
                                              title={connectorInfoByProvider.get(String(p).toLowerCase())?.name?.trim() || titleCase(p)}
                                              aria-label={connectorInfoByProvider.get(String(p).toLowerCase())?.name?.trim() || titleCase(p)}
                                            >
                                              <ConnectorLogo provider={p} className="h-4 w-4" />
                                            </div>
                                          ))}
                                          {t.connectors.length > 6 ? <span className="text-[11px] text-muted-foreground">+{t.connectors.length - 6}</span> : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {!marketplaceMarketingRenderingDisabled ? (
                    <>
                      {/* Screenshots (marketplace-style) */}
                      {hasScreenshotsSection ? (
                        <section className="space-y-4">
                          <div className="flex items-center gap-2">
                            <h2 className={SECTION_TITLE_CLASS}>Screenshots</h2>
                          </div>

                          {/* Mobile: horizontal screenshot strip */}
                          <div className="sm:hidden -mx-4 px-4 overflow-x-auto overflow-y-hidden pb-1 custom-scrollbar">
                            <div className="flex gap-4 snap-x snap-mandatory">
                              {screenshots.map(s3 => (
                                <div key={s3.key} className={`snap-start shrink-0 w-[86%] ${NAV_CARD_CLASS} overflow-hidden`}>
                                  <div className="aspect-[16/10] bg-background/20">
                                    <AgentProfileImage
                                      src={s3.src}
                                      alt={s3.alt}
                                      className="w-full h-full"
                                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                    />
                                  </div>
                                  <div className="px-4 py-3 text-xs font-semibold text-muted-foreground">{s3.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Desktop: 3-up grid */}
                          <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {screenshots.map(s3 => (
                              <div key={s3.key} className={`${NAV_CARD_CLASS} overflow-hidden`}>
                                <div className="aspect-[16/10] bg-background/20">
                                  <AgentProfileImage
                                    src={s3.src}
                                    alt={s3.alt}
                                    className="w-full h-full"
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                  />
                                </div>
                                <div className="px-4 py-3 text-xs font-semibold text-muted-foreground">{s3.label}</div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {/* Problem Statements Section */}
                      {hasProblemSection ? (
                        <section className="space-y-4">
                          <div className="flex items-center gap-2">
                            <h2 className={SECTION_TITLE_CLASS}>Problems this agent solves</h2>
                            <span className={SECTION_SUBTITLE_CLASS}>(examples)</span>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {problemStatementsText.slice(0, 3).map((statement, index) => (
                              <div key={index} className={`${NAV_CARD_CLASS} p-4`}>
                                <p className="text-sm leading-relaxed text-foreground">{statement}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </>
                  ) : null}

                  {/* Try These Prompts Row - sourced from template.previewPrompts (NOT marketing_content) */}
                  {hasTryPrompts ? (
                    <section className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h2 className={SECTION_TITLE_CLASS}>Try these prompts</h2>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {previewPrompts.map((p, idx) => (
                          <div key={idx} className={`group relative ${NAV_CARD_CLASS} p-4 cursor-pointer`}>
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex-shrink-0">
                                <Icon name="sparkles" className="h-4 w-4 text-primary" />
                              </div>
                              <p className="text-sm leading-relaxed text-foreground flex-1">{p}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </main>

        <ExploreCTA kind="agent" />
        <div
          suppressHydrationWarning
          className="h-px w-full bg-gradient-to-r from-transparent via-border/70 to-transparent"
          aria-hidden
        />
        <PublicFooter fromPath={`/explore/agents/${encodeURIComponent(template.slug)}`} />
      </div>

      {/* Instance-admin-only: generate marketplace marketing content */}
      <MarketplaceAgentMarketingFab templateId={template.id} marketingRenderingDisabled={marketplaceMarketingRenderingDisabled} />
    </>
  )
}

