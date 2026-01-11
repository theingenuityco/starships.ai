'use client'

import Icon from '@/components/primitives/Icon'

import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'
import { AgentDetailsModal } from '@/components/marketplace/AgentDetailsModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAgentTemplates } from '@/hooks/useTemplates'
import { PageLayout } from '@/components/layout/PageLayout'
import { useAuth } from '@/hooks/useAuth'
import PublicHeader from '@/components/navigation/PublicHeader'

import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { AgentTemplateModel } from '@starships/protocol'
import { track } from '@/lib/analytics'

export default function MarketplacePageClient(props: { initialAgentTemplates?: AgentTemplateModel[] }) {
  const { isAuthenticated } = useAuth()
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

  const [selectedAgent, setSelectedAgent] = useState<AgentTemplateModel | null>(null)
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false)

  const initialAgentTemplates = props.initialAgentTemplates ?? []
  const useServerInitial = initialAgentTemplates.length > 0

  // Fetch templates data (disabled when server provided initial data)
  const { data: agentData, isLoading: agentTemplatesLoadingRaw } = useAgentTemplates(undefined, !useServerInitial)
  const agentTemplates = (agentData ?? initialAgentTemplates ?? []) as AgentTemplateModel[]
  const agentTemplatesLoading = agentTemplatesLoadingRaw && !useServerInitial

  // Agent categories
  const allCategories = ['all', 'general', 'coding', 'creative', 'analysis', 'support', 'integration', 'automation', 'data', 'communication']

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
      category: (template as any)?.category,
    })
    setSelectedAgent(template)
    setIsAgentModalOpen(true)
  }

  const handleAgentModalOpenChange = (open: boolean) => {
    setIsAgentModalOpen(open)
    if (!open) setSelectedAgent(null)
  }

  return (
    <>
      {!isAuthenticated && <PublicHeader />}
      <PageLayout requireAuth={false}>
        <div className={`bg-background ${!isAuthenticated ? 'pt-16 sm:pt-20' : ''}`}>
          <div className="flex flex-col items-center px-4 sm:px-6 py-6 sm:py-8">
            <div className="w-full max-w-6xl mx-auto space-y-6 sm:space-y-8">
              {/* Page title */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Icon name="store" className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  <h1 className="text-xl sm:text-2xl font-bold">Marketplace</h1>
                </div>
                <p className="text-sm sm:text-base text-muted-foreground">Discover and deploy powerful agent and tools to enhance your starship&apos;s capabilities.</p>
              </div>

              {/* Search and Filters */}
              <div className="mb-6 sm:mb-8 sticky top-16 sm:top-20 z-30">
                <div className="relative max-w-md mb-6 mx-auto">
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
                    className="pl-10 pr-3 w-full frosted-glass-card shadow-frosted-lg rounded-2xl border border-border/40 bg-transparent"
                  />
                </div>
              </div>

              {/* Category Filter */}
              <div className="mb-6 sm:mb-8">
                <div className="flex sm:flex-wrap sm:justify-center gap-2 overflow-x-auto whitespace-nowrap -mx-4 px-4">
                  {allCategories.map(category => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        track({ type: 'marketplace_category_selected', category })
                        setSelectedCategory(category)
                        const params = new URLSearchParams(searchParams?.toString() ?? '')
                        if (category && category !== 'all') params.set('category', category)
                        else params.delete('category')
                        router.replace(`${pathname}?${params.toString()}`)
                      }}
                      className="capitalize shrink-0"
                    >
                      {category === 'all' ? 'All Categories' : category}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Agents Section */}
              <div className="space-y-4 sm:space-y-6">
                <div className="flex items-center gap-3">
                  <Icon name="head-circuit" className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  <h2 className="text-lg sm:text-xl font-semibold">Agents</h2>
                  <Badge variant="outline" className="ml-2">
                    {filteredAgentTemplates.length}
                  </Badge>
                </div>

                {agentTemplatesLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : filteredAgentTemplates.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {filteredAgentTemplates.map((template: AgentTemplateModel, idx: number) => (
                      <motion.div key={template.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                        <AgentTemplateCard template={template} onDeploy={handleAgentDeploy} onClick={handleAgentClick} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 border border-dashed border-muted-foreground/30 rounded-xl bg-muted/20">
                    <Icon name="head-circuit" className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-lg font-medium mb-2">No agent templates found</h3>
                    <p className="text-sm text-muted-foreground">Try adjusting your search or category filter.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <AgentDetailsModal template={selectedAgent} open={isAgentModalOpen} onOpenChange={handleAgentModalOpenChange} onDeploy={handleAgentDeploy} />
      </PageLayout>
    </>
  )
}
