import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import type { AgentTemplateModel, ToolTemplateModel } from '@starships/protocol'

import { fetchPublicAgentTemplates, fetchPublicToolTemplates } from '@/lib/server/public-templates'
import PublicHeader from '@/components/navigation/PublicHeader'
import Icon from '@/components/primitives/Icon'

import { MarketplaceAgentDeployCta } from '../MarketplaceAgentDeployCta'
import { MarketplaceShareLinkCard } from '../MarketplaceShareLinkCard'

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
  const imageUrl = template.avatarUrl || '/static-assets/og.jpg'

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

  return (
    <>
      {/* Hide public chrome when auth token exists (logged-in experience). */}
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              try {
                var cls = 'has-auth-token';
                var t = localStorage.getItem('starships_auth_token') || '';
                var looksLikeJwt = /^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/.test(t);
                document.documentElement.classList.toggle(cls, !!t && t !== 'null' && t !== 'undefined' && looksLikeJwt);
              } catch (e) {}
            })();
          `,
        }}
      />
      <style>{`
        .has-auth-token .marketplace-public-chrome {
          display: none !important;
        }
        .has-auth-token .marketplace-agent-main {
          padding-top: 1.5rem !important;
        }
        @media (min-width: 640px) {
          .has-auth-token .marketplace-agent-main {
            padding-top: 2rem !important;
          }
        }
      `}</style>

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
            <section className="mt-4 sm:mt-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-2xl ring-1 ring-border/50 bg-muted/40 overflow-hidden shadow-lg">
                    {template.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={template.avatarUrl} alt="" width={112} height={112} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <span className="text-lg sm:text-xl font-semibold text-muted-foreground">{initials || 'AI'}</span>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                  </div>

                  <div className="min-w-0">
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
              </div>
            </section>

            {/* Main content grid */}
            <section className="mt-8 pb-10 sm:pb-16">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 items-start">
                {/* Left column */}
                <div className="space-y-8">
                  {template.description ? (
                    <section className="rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm p-6">
                      <h2 className="text-sm font-semibold tracking-wide text-foreground">About</h2>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{template.description}</p>
                    </section>
                  ) : null}

                  {toolSlugs.length > 0 ? (
                    <section className="rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm p-6">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold tracking-wide text-foreground">Capabilities</h2>
                        <span className="inline-flex items-center rounded-full border border-border/60 bg-background/40 px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                          {toolSlugs.length} tools
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {toolSlugs.map(slug => {
                          const info = toolInfoBySlug.get(slug)
                          const title = info?.name?.trim() || slug
                          const desc = info?.description?.trim() || ''
                          return (
                            <div key={slug} className="group rounded-xl border border-border/50 bg-background/30 hover:bg-background/40 transition-colors p-4">
                              <div className="text-sm font-medium leading-5 truncate">{title}</div>
                              {desc ? <div className="mt-1 text-xs leading-4 text-muted-foreground line-clamp-3">{desc}</div> : null}
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  ) : null}

                  {Array.isArray(template.previewPrompts) && template.previewPrompts.length > 0 ? (
                    <section className="rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm p-6">
                      <h2 className="text-sm font-semibold tracking-wide text-foreground">Try these prompts</h2>
                      <div className="mt-4 grid grid-cols-1 gap-3">
                        {template.previewPrompts.map((p, idx) => (
                          <div key={idx} className="rounded-xl border border-border/50 bg-background/30 p-4 text-sm leading-relaxed">
                            <span className="text-muted-foreground">&quot;</span>
                            <span className="text-foreground/90">{p}</span>
                            <span className="text-muted-foreground">&quot;</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>

                {/* Right column */}
                <aside className="lg:sticky lg:top-28 space-y-4">
                  <div className="rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm p-6">
                    <div className="text-sm font-semibold">Deploy this agent</div>
                    <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      Add this agent to your starship in one click. Connect apps from your starship’s Connectors page after deployment.
                    </div>
                    <div className="mt-4">
                      <MarketplaceAgentDeployCta template={template} />
                    </div>
                    <div className="mt-4 border-t border-border/50 pt-4 space-y-2 text-xs text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary/60" />
                        <span>Private by default (you control what it can access)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary/60" />
                        <span>Works with your existing connectors</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary/60" />
                        <span>Start chatting immediately after deploy</span>
                      </div>
                    </div>
                  </div>

                  <MarketplaceShareLinkCard shareUrl={shareUrl} />
                </aside>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
