'use client'

import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'
import { ToolTemplateCard } from '@/components/marketplace/ToolTemplateCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAgentTemplates, useToolTemplates } from '@/hooks/useTemplates'
import { PageLayout } from '@/components/layout/PageLayout'
import { Bot, Search, Wrench, Store, Filter, Package } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { AgentTemplateModel, ToolTemplateModel } from '@starships/protocol'

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Fetch templates data
  const { data: agentTemplates = [], isLoading: agentTemplatesLoading } = useAgentTemplates()
  const { data: toolTemplates = [], isLoading: toolTemplatesLoading } = useToolTemplates()

  // Unified categories from both agents and tools
  const allCategories = ['all', 'general', 'coding', 'creative', 'analysis', 'support', 'integration', 'automation', 'data', 'communication']

  // Filter agent templates
  const filteredAgentTemplates = agentTemplates.filter((template: AgentTemplateModel) => {
    const matchesSearch =
      !searchQuery || template.name.toLowerCase().includes(searchQuery.toLowerCase()) || (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // Filter tool templates
  const filteredToolTemplates = toolTemplates.filter((template: ToolTemplateModel) => {
    const matchesSearch = !searchQuery || template.name.toLowerCase().includes(searchQuery.toLowerCase()) || template.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // Handle template deployment/installation
  const handleAgentDeploy = (template: AgentTemplateModel) => {
    // Handle successful deployment - could show a success message or redirect
  }

  const handleToolInstall = (template: ToolTemplateModel) => {
    // Handle successful installation - could show a success message
  }

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Store className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Template Marketplace</h1>
              </div>
              <p className="text-muted-foreground">Discover and deploy powerful agent templates and tools to enhance your starship's capabilities.</p>
            </div>

            {/* Search and Filters */}
            <div className="mb-8">
              <div className="relative max-w-md mb-6">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <Input type="text" placeholder="Search templates..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 pr-4 py-2 w-full" />
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2 justify-center mb-8">
              {allCategories.map(category => (
                <Button key={category} variant={selectedCategory === category ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(category)} className="capitalize">
                  {category === 'all' ? 'All Categories' : category}
                </Button>
              ))}
            </div>

            {/* Agent Templates Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Bot className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-semibold">Agent Templates</h2>
                <Badge variant="outline" className="ml-2">
                  {filteredAgentTemplates.length}
                </Badge>
              </div>

              {agentTemplatesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : filteredAgentTemplates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredAgentTemplates.map((template: AgentTemplateModel, idx: number) => (
                    <motion.div key={template.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                      <AgentTemplateCard template={template} onDeploy={handleAgentDeploy} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-muted-foreground/30 rounded-xl bg-muted/20">
                  <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="text-lg font-medium mb-2">No agent templates found</h3>
                  <p className="text-sm text-muted-foreground">Try adjusting your search or category filter.</p>
                </div>
              )}
            </div>

            {/* Tool Templates Section */}
            <div className="space-y-6 mt-12">
              <div className="flex items-center gap-3">
                <Wrench className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-semibold">Tool Templates</h2>
                <Badge variant="outline" className="ml-2">
                  {filteredToolTemplates.length}
                </Badge>
              </div>

              {toolTemplatesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : filteredToolTemplates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredToolTemplates.map((template: ToolTemplateModel, idx: number) => (
                    <motion.div key={template.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                      <ToolTemplateCard template={template} onInstall={handleToolInstall} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-muted-foreground/30 rounded-xl bg-muted/20">
                  <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="text-lg font-medium mb-2">No tool templates found</h3>
                  <p className="text-sm text-muted-foreground">Try adjusting your search or category filter.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
