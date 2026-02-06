import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import type { AgentTemplateModel, ToolTemplateModel } from '@starships/protocol'

import { fetchPublicAgentTemplates, fetchPublicToolTemplates } from '@/lib/server/public-templates'
import PublicHeader from '@/components/navigation/PublicHeader'
import Icon from '@/components/primitives/Icon'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'
import { MarketplaceAgentMarketingFab } from '@/components/marketplace/MarketplaceAgentMarketingFab'

import { MarketplaceAgentDeployCta } from '../MarketplaceAgentDeployCta'
import { MarketplaceShareLinkCard } from '../MarketplaceShareLinkCard'
import { CapabilitiesLegendTooltip } from './CapabilitiesLegendTooltip'
import { AgentProfileImage } from '@/components/marketplace/AgentProfileImage'
import { PublicFooter } from '@/app/components/PublicFooter'

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

async function getTemplateBySlug(slug: string): Promise<AgentTemplateModel | null> {
  const templates = await fetchPublicAgentTemplates({ revalidateSeconds: revalidate })
  return templates.find(t => t.slug === slug) ?? null
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = await props.params
  const s = normalizeSlug(slug)
  const template = s ? await getTemplateBySlug(s) : null

  if (!template) {
    return {
      title: 'Agent not found | Marketplace | Starships.ai',
      description: 'This marketplace agent doesn’t exist (or is no longer published).',
      alternates: { canonical: 'https://starships.ai/marketplace' },
    }
  }

  const title = `${template.name} | Marketplace | Starships.ai`
  const description = template.description || `Learn more about ${template.name} on the Starships.ai Marketplace.`
  const url = `https://starships.ai/marketplace/agents/${encodeURIComponent(template.slug)}`
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

export default async function MarketplaceAgentDetailsPage(props: PageProps) {
  const { slug } = await props.params
  const s = normalizeSlug(slug)
  if (!s) notFound()

  const template = await getTemplateBySlug(s)
  if (!template) notFound()

  const toolTemplates = await fetchPublicToolTemplates({ revalidateSeconds: revalidate })
  const toolInfoBySlug = new Map<string, ToolTemplateModel>()
  for (const t of toolTemplates) {
    if (typeof t?.slug === 'string' && t.slug.trim()) toolInfoBySlug.set(t.slug, t)
  }

  const toolSlugs = Array.isArray(template.assignedToolSlugs) ? template.assignedToolSlugs.filter(s => typeof s === 'string' && s.trim().length > 0) : []
  const shareUrl = `https://starships.ai/marketplace/agents/${encodeURIComponent(template.slug)}`

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

  const hasProblemImage = !!problemStatementsImageUrl
  const hasProblemText = problemStatementsText.length > 0
  const hasProblemSection = hasProblemImage || hasProblemText

  const hasCapabilitiesImage = !!capabilitiesImageUrl
  const hasCapabilitiesSection = toolSlugs.length > 0

  const hasTryPrompts = previewPrompts.length > 0
  const hasTryPromptsImage = !!tryThesePromptsImageUrl

  return (
    <>
      <div className="marketplace-public-chrome">
        <PublicHeader />
      </div>

      <main className="marketplace-agent-main pt-20 sm:pt-28">
        {/* Decorative hero background */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[360px] overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.22),transparent_60%)] blur-2xl" />
            <div className="absolute left-1/4 top-24 h-[280px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18),transparent_60%)] blur-2xl" />
          </div>

          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            {/* Breadcrumb */}
            <div className="pt-2 sm:pt-0 flex items-center gap-2 text-xs text-muted-foreground">
              <a href="/marketplace" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Icon name="arrow-left" className="h-3.5 w-3.5" iconOverride={{ type: 'phosphor', component: 'ArrowLeft' }} />
                <span>Marketplace</span>
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
                    {template.role ? <div className="mt-1 text-sm sm:text-base text-muted-foreground line-clamp-2 max-w-[72ch]">{template.role}</div> : null}

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
                <div className="flex items-center gap-3 flex-shrink-0">
                  <MarketplaceAgentDeployCta template={template} />
                  <MarketplaceShareLinkCard shareUrl={shareUrl} compact />
                </div>
              </div>

              {/* Description as separate section below */}
              {template.description ? <p className="mt-6 text-sm sm:text-base leading-relaxed text-muted-foreground max-w-[72ch]">{template.description}</p> : null}
            </section>

            {/* Main content grid */}
            <section className="mt-8 pb-10 sm:pb-16">
              <div className="space-y-16 sm:space-y-20">
                {hasCapabilitiesSection ? (
                  hasCapabilitiesImage ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                      {/* Capabilities */}
                      <section className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Icon name="wrench" className="h-5 w-5 text-primary" />
                          <h2 className="text-base font-semibold tracking-tight text-foreground">Capabilities</h2>
                          <CapabilitiesLegendTooltip />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {toolSlugs.map(slug => {
                            const info = toolInfoBySlug.get(slug)
                            const title = info?.name?.trim() || slug
                            const desc = info?.description?.trim() || ''
                            const templateDefault = (template.assignedToolDefaultPermissions?.[slug] ?? undefined) as CapabilityPermission | undefined
                            const permission = templateDefault ?? inferCapabilityPermission(info)
                            return (
                              <div key={slug} className="group relative rounded-lg border border-border/50 bg-gradient-to-br from-background/50 to-background/30 p-4">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 flex-shrink-0">
                                    <div className={`h-2 w-2 rounded-full ${permissionDotClassName(permission)}`} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold leading-5 text-foreground">{title}</div>
                                    {desc ? <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">{desc}</div> : null}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </section>

                      {/* Capabilities Image */}
                      <div className="rounded-lg border border-border/40 overflow-hidden">
                        <AgentProfileImage
                          src={capabilitiesImageUrl as string}
                          alt={
                            toolSlugs.length > 0
                              ? `${template.name} capabilities: ${toolSlugs
                                  .slice(0, 3)
                                  .map(slug => {
                                    const info = toolInfoBySlug.get(slug)
                                    return info?.name?.trim() || slug
                                  })
                                  .join(', ')}`
                              : `${template.name} capabilities`
                          }
                          className="w-full h-auto"
                          style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }}
                        />
                      </div>
                    </div>
                  ) : (
                    <section className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Icon name="wrench" className="h-5 w-5 text-primary" />
                        <h2 className="text-base font-semibold tracking-tight text-foreground">Capabilities</h2>
                        <CapabilitiesLegendTooltip />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {toolSlugs.map(slug => {
                          const info = toolInfoBySlug.get(slug)
                          const title = info?.name?.trim() || slug
                          const desc = info?.description?.trim() || ''
                          const templateDefault = (template.assignedToolDefaultPermissions?.[slug] ?? undefined) as CapabilityPermission | undefined
                          const permission = templateDefault ?? inferCapabilityPermission(info)
                          return (
                            <div key={slug} className="group relative rounded-lg border border-border/50 bg-gradient-to-br from-background/50 to-background/30 p-4">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex-shrink-0">
                                  <div className={`h-2 w-2 rounded-full ${permissionDotClassName(permission)}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold leading-5 text-foreground">{title}</div>
                                  {desc ? <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">{desc}</div> : null}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                ) : null}

                {/* Problem Statements Section */}
                {hasProblemSection ? (
                  hasProblemImage ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                      {/* Problem Statements Image */}
                      <div className="rounded-lg border border-border/40 overflow-hidden">
                        <AgentProfileImage
                          src={problemStatementsImageUrl as string}
                          alt={
                            hasProblemText
                              ? `${template.name} understanding user challenges: ${problemStatementsText
                                  .slice(0, 3)
                                  .map(s => `"${s}"`)
                                  .join(', ')}`
                              : `${template.name} - The Problem`
                          }
                          className="w-full h-auto"
                          style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }}
                        />
                      </div>

                      {/* Problem Statements Text (no outer card background) */}
                      {hasProblemText ? (
                        <section className="h-full flex flex-col justify-between px-1 sm:px-2 py-2">
                          <div className="flex-1 flex flex-col justify-between space-y-10">
                            {problemStatementsText.slice(0, 3).map((statement, index) => (
                              <p key={index} className={`text-2xl text-foreground leading-relaxed italic ${index % 2 === 0 ? 'text-left' : 'text-right'}`}>
                                &quot;{statement}&quot;
                              </p>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  ) : hasProblemText ? (
                    <section className="px-1 sm:px-2 py-2">
                      <div className="flex flex-col space-y-10">
                        {problemStatementsText.slice(0, 3).map((statement, index) => (
                          <p key={index} className={`text-2xl text-foreground leading-relaxed italic ${index % 2 === 0 ? 'text-left' : 'text-right'}`}>
                            &quot;{statement}&quot;
                          </p>
                        ))}
                      </div>
                    </section>
                  ) : null
                ) : null}

                {/* Try These Prompts Row - 2 columns */}
                {hasTryPrompts ? (
                  hasTryPromptsImage ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                      {/* Try These Prompts Image */}
                      <div className="rounded-lg border border-border/40 overflow-hidden">
                        <AgentProfileImage
                          src={tryThesePromptsImageUrl as string}
                          alt={
                            previewPrompts.length > 0
                              ? `${template.name} try these prompts: ${previewPrompts
                                  .slice(0, 3)
                                  .map(p => `"${p}"`)
                                  .join(', ')}`
                              : `${template.name} try these prompts`
                          }
                          className="w-full h-auto"
                          style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }}
                        />
                      </div>

                      {/* Try These Prompts */}
                      <section className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Icon name="message-square" className="h-5 w-5 text-primary" />
                          <h2 className="text-base font-semibold tracking-tight text-foreground">Try these prompts</h2>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {previewPrompts.map((p, idx) => (
                            <div key={idx} className="group relative rounded-lg border border-border/50 bg-gradient-to-br from-background/50 to-background/30 p-4 cursor-pointer">
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
                    </div>
                  ) : (
                    <section className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Icon name="message-square" className="h-5 w-5 text-primary" />
                        <h2 className="text-base font-semibold tracking-tight text-foreground">Try these prompts</h2>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {previewPrompts.map((p, idx) => (
                          <div key={idx} className="group relative rounded-lg border border-border/50 bg-gradient-to-br from-background/50 to-background/30 p-4 cursor-pointer">
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
                  )
                ) : null}
              </div>
            </section>

            {/* Bottom Deploy Section */}
            <section className="mt-6 sm:mt-8 pb-10 sm:pb-16 pt-2">
              <div className="max-w-2xl mx-auto text-center">
                <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-6">Ready to get started?</h2>
                <div className="flex justify-center">
                  <MarketplaceAgentDeployCta template={template} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <PublicFooter fromPath={`/marketplace/agents/${encodeURIComponent(template.slug)}`} />

      {/* Instance-admin-only: generate marketplace marketing content */}
      <MarketplaceAgentMarketingFab templateId={template.id} />
    </>
  )
}
