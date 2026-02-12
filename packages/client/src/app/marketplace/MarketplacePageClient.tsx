'use client'

import Icon from '@/components/primitives/Icon'

import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAgentTemplates } from '@/hooks/useTemplates'
import PublicHeader from '@/components/navigation/PublicHeader'
import { getCategoryDotColor } from '@/components/agents/AgentBuilder/utils/categoryHelpers'

import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { AgentTemplateModel } from '@starships/protocol'
import { track } from '@/lib/analytics'

export default function MarketplacePageClient(props: { initialAgentTemplates?: AgentTemplateModel[] }) {
  const [searchQuery, setSearchQuery] = useState('')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const categoryFromUrl = useMemo(() => (searchParams?.get('category') ?? 'all').toLowerCase(), [searchParams])
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryFromUrl)

  // Keep state in sync with URL changes (back/forward/navigation)
  useEffect(() => {
    setSelectedCategory(categoryFromUrl)
  }, [categoryFromUrl])

  const initialAgentTemplates = props.initialAgentTemplates ?? []
  // Fetch templates data on the client even when ISR provided initial HTML.
  // Use ISR payload as initialData, then refetch once on mount to stay fresh.
  const { data: agentData, isLoading: agentTemplatesLoadingRaw } = useAgentTemplates(
    undefined,
    true,
    initialAgentTemplates.length > 0 ? { initialData: initialAgentTemplates } : undefined
  )
  const agentTemplates = (agentData ?? initialAgentTemplates ?? []) as AgentTemplateModel[]
  const agentTemplatesLoading = agentTemplatesLoadingRaw && agentTemplates.length === 0

  const agentFromUrl = useMemo(() => searchParams?.get('agent') ?? null, [searchParams])

  // Agent categories
  const allCategories = ['all', 'general', 'coding', 'creative', 'analysis', 'support', 'integration', 'automation', 'data', 'communication']
  const selectedCategoryLabel = useMemo(() => {
    const raw = String(selectedCategory || '').trim()
    if (!raw || raw === 'all') return 'All Categories'
    // Normalize to a pleasant display label (Title Case, spaces instead of separators)
    const words = raw.replace(/[_-]+/g, ' ').split(' ').filter(Boolean)
    return words.map(w => (w.length ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
  }, [selectedCategory])

  // Filter agent templates
  const filteredAgentTemplates = agentTemplates.filter((template: AgentTemplateModel) => {
    const matchesSearch =
      !searchQuery || template.name.toLowerCase().includes(searchQuery.toLowerCase()) || (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // Handle template deployment/installation
  const handleAgentDeploy = (_template: AgentTemplateModel) => {
    // Handle successful deployment - could show a success message or redirect
  }

  const handleAgentClick = (template: AgentTemplateModel) => {
    track({
      type: 'marketplace_agent_template_opened',
      templateId: template.id,
      templateName: template.name,
      category: template.category,
    })
    router.push(`/explore/agents/${encodeURIComponent(template.slug)}`)
  }

  // Back-compat: old links used `?agent=<id|slug>` to open a modal.
  // Redirect them to the dedicated agent page.
  useEffect(() => {
    if (!agentFromUrl) return
    if (agentTemplatesLoading) return
    if (!Array.isArray(agentTemplates) || agentTemplates.length === 0) return

    const found = agentTemplates.find(t => t.slug === agentFromUrl) ?? agentTemplates.find(t => t.id === agentFromUrl) ?? null
    if (!found) return

    // Preserve other query params (e.g. category) by leaving the listing URL alone in history
    // and pushing the canonical details route.
    router.replace(`/explore/agents/${encodeURIComponent(found.slug)}`)
  }, [agentFromUrl, agentTemplates, agentTemplatesLoading, router])

  return (
    <>
      <div className="marketplace-public-chrome">
        <PublicHeader />
      </div>

      <main className="marketplace-main pt-20 sm:pt-28 pb-12 sm:pb-16">
        <div className="relative">
          {/* Decorative hero background (match agent details) */}
          <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[360px] overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.22),transparent_60%)] blur-2xl" />
            <div className="absolute left-1/4 top-24 h-[280px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18),transparent_60%)] blur-2xl" />
          </div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            {/* Header */}
            <div className="flex flex-col gap-5 sm:gap-6">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">Explore</h1>
                  <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-[72ch]">
                    Find and install agents, tools, and connectors.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-sm px-3 py-1 border-border/60 bg-background/40">
                    {filteredAgentTemplates.length} agents
                  </Badge>
                </div>
              </div>

              {/* Search + filter panel (card style like listing cards) */}
              <div className="rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="Search agents..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const q = searchQuery.trim()
                          if (q) track({ type: 'marketplace_search_used', query: q })
                        }
                      }}
                      className="pl-10 pr-3 w-full rounded-lg border border-border/60 bg-background/40"
                    />
                  </div>

                  <Select
                    value={selectedCategory}
                    onValueChange={category => {
                      track({ type: 'marketplace_category_selected', category })
                      setSelectedCategory(category)
                      const params = new URLSearchParams(searchParams?.toString() ?? '')
                      if (category && category !== 'all') params.set('category', category)
                      else params.delete('category')
                      router.replace(`${pathname}?${params.toString()}`)
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[220px] rounded-lg border border-border/60 bg-background/40 h-10">
                      <div className="flex items-center gap-2">
                        {selectedCategory && selectedCategory !== 'all' && <span className={`h-2 w-2 rounded-full ${getCategoryDotColor(selectedCategory as any)}`} />}
                        <span className="truncate">{selectedCategoryLabel}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {allCategories.map(category => (
                        <SelectItem key={category} value={category} className="capitalize">
                          <div className="flex items-center gap-2">
                            {category !== 'all' && <span className={`h-2 w-2 rounded-full ${getCategoryDotColor(category as any)}`} />}
                            <span>{category === 'all' ? 'All Categories' : category}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="mt-8">
              {agentTemplatesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-56 rounded-lg border border-border/60 bg-card animate-pulse" />
                  ))}
                </div>
              ) : filteredAgentTemplates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {filteredAgentTemplates.map((template: AgentTemplateModel, idx: number) => (
                    <motion.div key={template.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                      <AgentTemplateCard template={template} onDeploy={handleAgentDeploy} onClick={handleAgentClick} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-card shadow-sm p-10 text-center">
                  <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center">
                    <Icon name="head-circuit" className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">No agents found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or category filter.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
