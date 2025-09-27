'use client'

import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'
import { ToolTemplateCard } from '@/components/marketplace/ToolTemplateCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAgentTemplates, useToolTemplates } from '@/hooks/useTemplates'
import { Bot, Search, Wrench } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { AgentTemplateModel, ToolTemplateModel } from '@starships/protocol'

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Fetch templates data
  const { data: agentTemplates = [], isLoading: agentTemplatesLoading } = useAgentTemplates()
  const { data: toolTemplates = [], isLoading: toolTemplatesLoading } = useToolTemplates()

  // Filter templates based on search and category
  const filteredAgentTemplates = agentTemplates.filter((template: AgentTemplateModel) => {
    const matchesSearch = !searchQuery || template.name.toLowerCase().includes(searchQuery.toLowerCase()) || template.description?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  const filteredToolTemplates = toolTemplates.filter((template: ToolTemplateModel) => {
    const matchesSearch = !searchQuery || template.name.toLowerCase().includes(searchQuery.toLowerCase()) || template.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  const agentCategories = ['all', 'general', 'coding', 'creative', 'analysis', 'support']
  const toolCategories = ['all', 'general', 'integration', 'automation', 'data', 'communication']

  // Handle template deployment/installation
  const handleAgentDeploy = (template: AgentTemplateModel) => {
    // Handle successful deployment - could show a success message or redirect
  }

  const handleToolInstall = (template: ToolTemplateModel) => {
    // Handle successful installation - could show a success message
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">Template Marketplace</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">Discover and deploy powerful agent templates and tools to enhance your starship's capabilities.</p>
        </motion.div>

        {/* Search and Filters */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <div className="relative max-w-md mx-auto mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input type="text" placeholder="Search templates..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 pr-4 py-2 w-full" />
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Tabs defaultValue="agents" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
              <TabsTrigger value="agents" className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Agent Templates
              </TabsTrigger>
              <TabsTrigger value="tools" className="flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                Tool Templates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="agents" className="space-y-6">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {agentCategories.map(category => (
                  <Button key={category} variant={selectedCategory === category ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(category)} className="capitalize">
                    {category === 'all' ? 'All Categories' : category}
                  </Button>
                ))}
              </div>

              {/* Agent Templates Grid */}
              {agentTemplatesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
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
                <div className="text-center py-12">
                  <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No agent templates found</h3>
                  <p className="text-muted-foreground">Try adjusting your search or category filter.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="tools" className="space-y-6">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {toolCategories.map(category => (
                  <Button key={category} variant={selectedCategory === category ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(category)} className="capitalize">
                    {category === 'all' ? 'All Categories' : category}
                  </Button>
                ))}
              </div>

              {/* Tool Templates Grid */}
              {toolTemplatesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
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
                <div className="text-center py-12">
                  <Wrench className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No tool templates found</h3>
                  <p className="text-muted-foreground">Try adjusting your search or category filter.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  )
}
