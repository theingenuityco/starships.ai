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
import { CapabilitiesLegendTooltip } from '@/app/marketplace/agents/[slug]/CapabilitiesLegendTooltip'

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
  // Explore pages have no starship-specific permission matrix.
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

function possessiveLabel(name: string): string {
  const n = String(name || '').trim()
  if (!n) return 'This agent’s'
  // If the name ends in "s", prefer "Jess’" over "Jess’s".
  return /s$/i.test(n) ? `${n}’` : `${n}’s`
}

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
    // random suffix (e.g. "gmail" vs "gmail-a1b2"). Index both to make lookups reliable.
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

  const initials = String(template.name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('')

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
          alt: `${template.name} screenshots: capabilities and tools`,
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
  ].filter(Boolean) as { key: string; label: string; src: string; alt: string }[]

  const canShowScreenshots = screenshots.length > 0 && !marketplaceMarketingRenderingDisabled

  // Details/Capabilities/Prompts sections are text-based; screenshots are optional.
  const rightRailSections = [
    hasProblemSection ? 'problem' : null,
    hasCapabilitiesSection ? 'capabilities' : null,
    hasTryPrompts ? 'prompts' : null,
    canShowScreenshots ? 'screenshots' : null,
  ].filter(Boolean) as string[]

  return (
    <>
      <PublicHeader />

      <main className="marketplace-agent-main">
        {/* Decorative hero background */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[360px] overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.22),transparent_60%)] blur-2xl" />
            <div className="absolute left-1/4 top-24 h-[280px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18),transparent_60%)] blur-2xl" />
          </div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6">
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

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {template.category ? (
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${categoryBadgeClass(template.category)}`}>{template.category}</span>
                      ) : null}
                      {template.version ? (
                        <span className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-3 py-1 text-xs font-semibold font-mono">v{template.version}</span>
                      ) : null}
                      {typeof template.usageCount === 'number' ? (
                        <span className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-3 py-1 text-xs font-semibold text-muted-foreground">
                          {template.usageCount.toLocaleString()} deployments
                        </span>
                      ) : null}
                      {template.model ? (
                        <span className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-3 py-1 text-xs font-semibold font-mono">{template.model}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Action buttons at extreme right */}
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch shrink-0">
                  <MarketplaceAgentDeployCta template={template} />
                  <MarketplaceShareLinkCard shareUrl={shareUrl} />
                </div>
              </div>
            </section>

            {/* Main layout */}
            <div className={`grid grid-cols-1 ${marketplaceMarketingRenderingDisabled ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} gap-8 pb-16`}>
              {/* Left column */}
              <section className={`space-y-10 ${marketplaceMarketingRenderingDisabled ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
                {/* Description */}
                <div className={NAV_CARD_CLASS}>
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className={SECTION_TITLE_CLASS}>About</div>
                    </div>
                    {template.description ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{template.description}</p> : null}
                  </div>
                </div>

                {/* Problems */}
                {hasProblemSection ? (
                  <section id="problem" className="scroll-mt-28">
                    <div className={NAV_CARD_CLASS}>
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={SECTION_TITLE_CLASS}>Problems it solves</div>
                            <div className={`${SECTION_SUBTITLE_CLASS} mt-1`}>What {agentSubjectLabel(template.name)} is built for.</div>
                          </div>
                          <Icon name="sparkles" className="h-4 w-4 text-primary/80" />
                        </div>
                        <ul className="mt-4 space-y-2">
                          {problemStatementsText.map((p, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/60" aria-hidden />
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </section>
                ) : null}

                {/* Capabilities */}
                {hasCapabilitiesSection ? (
                  <section id="capabilities" className="scroll-mt-28">
                    <div className={NAV_CARD_CLASS}>
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className={SECTION_TITLE_CLASS}>Capabilities</div>
                              <CapabilitiesLegendTooltip />
                            </div>
                            <div className={`${SECTION_SUBTITLE_CLASS} mt-1`}>Tools and connectors {possessiveLabel(template.name)} uses.</div>
                          </div>
                          <Icon name="magic-wand" className="h-4 w-4 text-primary/80" />
                        </div>

                        <div className="mt-5 space-y-3">
                          {toolSlugs.map((slugv, idx) => {
                            const info = toolInfoBySlug.get(String(slugv).trim().toLowerCase())
                            const displayName = info?.name || titleCase(String(slugv).replace(/[-_]+/g, ' '))
                            const permission = inferCapabilityPermission(info)
                            const connectorProvider = (info as any)?.connectorProvider as string | undefined
                            const connector = connectorProvider ? connectorInfoByProvider.get(String(connectorProvider).trim().toLowerCase()) : undefined
                            return (
                              <div key={`${slugv}-${idx}`} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-4 py-3">
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/60 shrink-0">
                                    {connector?.provider ? <ConnectorLogo provider={String(connector.provider)} className="h-4 w-4" /> : <Icon name="wrench" className="h-4 w-4 text-muted-foreground" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="font-semibold text-sm truncate">{displayName}</div>
                                      <span className={`h-2 w-2 rounded-full ${permissionDotClassName(permission)}`} aria-label={`Permission: ${permission}`} title={`Permission: ${permission}`} />
                                    </div>
                                    {info?.description ? <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{info.description}</div> : null}
                                    {connector?.name ? <div className="mt-1 text-[11px] text-muted-foreground">Connector: {connector.name}</div> : null}
                                  </div>
                                </div>
                                <div className="text-[11px] text-muted-foreground font-mono shrink-0">{String(slugv)}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {/* Prompts */}
                {hasTryPrompts ? (
                  <section id="prompts" className="scroll-mt-28">
                    <div className={NAV_CARD_CLASS}>
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={SECTION_TITLE_CLASS}>Try these prompts</div>
                            <div className={`${SECTION_SUBTITLE_CLASS} mt-1`}>A few good starting points.</div>
                          </div>
                          <Icon name="message-circle" className="h-4 w-4 text-primary/80" />
                        </div>
                        <div className="mt-4 space-y-3">
                          {previewPrompts.map((p, idx) => (
                            <div key={idx} className="rounded-lg border border-border/60 bg-background/40 px-4 py-3">
                              <div className="text-sm text-muted-foreground whitespace-pre-wrap">{p}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {/* Screenshots */}
                {canShowScreenshots ? (
                  <section id="screenshots" className="scroll-mt-28">
                    <div className={NAV_CARD_CLASS}>
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={SECTION_TITLE_CLASS}>Screenshots</div>
                            <div className={`${SECTION_SUBTITLE_CLASS} mt-1`}>A quick visual overview.</div>
                          </div>
                          <Icon name="image" className="h-4 w-4 text-primary/80" />
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-4">
                          {screenshots.map(s3 => (
                            <div key={s3.key} className="rounded-lg border border-border/60 bg-background/40 overflow-hidden">
                              <div className="px-4 py-3 border-b border-border/60 text-xs font-semibold text-muted-foreground">{s3.label}</div>
                              <div className="p-4">
                                <AgentProfileImage src={s3.src} alt={s3.alt} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}
              </section>

              {/* Right rail (nav + avatar) */}
              {!marketplaceMarketingRenderingDisabled ? (
                <aside className={`space-y-10 ${marketplaceMarketingRenderingDisabled ? 'lg:col-span-3' : 'lg:col-span-1'}`}>
                  <div className="sticky top-28 space-y-4">
                    <div className={`${NAV_CARD_CLASS} overflow-hidden`}>
                      <div className="p-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full border border-border/60 bg-background/60 flex items-center justify-center font-semibold text-muted-foreground">
                            {initials || 'AI'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{template.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{template.role || template.slug}</div>
                          </div>
                        </div>

                        {rightRailSections.length > 0 ? (
                          <div className="mt-4 space-y-1">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">On this page</div>
                            {rightRailSections.map(k => {
                              const label =
                                k === 'problem' ? 'Problems' : k === 'capabilities' ? 'Capabilities' : k === 'prompts' ? 'Prompts' : k === 'screenshots' ? 'Screenshots' : k
                              return (
                                <a key={k} href={`#${k}`} className="block rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
                                  {label}
                                </a>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </aside>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      <PublicFooter fromPath={`/explore/agents/${encodeURIComponent(template.slug)}`} />
      {/* Instance-admin-only: generate marketing content */}
      <MarketplaceAgentMarketingFab templateId={template.id} marketingRenderingDisabled={marketplaceMarketingRenderingDisabled} />
    </>
  )
}

