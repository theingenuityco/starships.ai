'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Search, Star, Users, Sparkles, Code, Palette, BarChart3, Headphones, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentTemplate } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

interface AgentTemplateSelectorProps {
  onSelectTemplate: (template: AgentTemplate) => void
  onCreateFromTemplate: (templateId: string) => void
  trigger?: React.ReactNode
}

const categoryIcons = {
  general: Sparkles,
  coding: Code,
  creative: Palette,
  analysis: BarChart3,
  support: Headphones,
}

const categoryColors = {
  general: 'bg-blue-100 text-blue-800 border-blue-200',
  coding: 'bg-green-100 text-green-800 border-green-200',
  creative: 'bg-purple-100 text-purple-800 border-purple-200',
  analysis: 'bg-orange-100 text-orange-800 border-orange-200',
  support: 'bg-pink-100 text-pink-800 border-pink-200',
}

export function AgentTemplateSelector({ onCreateFromTemplate, trigger }: AgentTemplateSelectorProps) {
  const { userName } = useAuth()
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [filteredTemplates, setFilteredTemplates] = useState<AgentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  useEffect(() => {
    loadTemplates()
  }, [])

  useEffect(() => {
    filterTemplates()
  }, [templates, searchQuery, selectedCategory])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      // Use the real API to fetch templates
      const { templateAPI } = await import('@/lib/api')
      const templates = await templateAPI.getAll()
      setTemplates(templates)
    } catch (error) {
      console.error('Failed to load templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterTemplates = () => {
    let filtered = templates

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(template => template.category === selectedCategory)
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(template => template.name.toLowerCase().includes(query) || (template.description && template.description.toLowerCase().includes(query)))
    }

    setFilteredTemplates(filtered)
  }

  const handleSelectTemplate = (template: AgentTemplate) => {
    // Directly create agent from template without asking for name
    try {
      onCreateFromTemplate(template.id)
    } catch (error) {
      console.error('Failed to create agent from template:', error)
      // TODO: Add error handling UI
    }
  }

  const renderTemplateCard = (template: AgentTemplate) => {
    const CategoryIcon = categoryIcons[template.category as keyof typeof categoryIcons]

    return (
      <Card key={template.id} className="cursor-pointer hover:shadow-md transition-all border-border/50 hover:border-primary/30 overflow-hidden">
        <CardHeader className="pb-3 bg-muted/10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-12 h-12 rounded-lg flex items-center justify-center text-2xl',
                  template.category === 'general' && 'bg-blue-100/50',
                  template.category === 'coding' && 'bg-green-100/50',
                  template.category === 'creative' && 'bg-purple-100/50',
                  template.category === 'analysis' && 'bg-orange-100/50',
                  template.category === 'support' && 'bg-pink-100/50'
                )}
              >
                {template.icon}
              </div>
              <div>
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-xs ${categoryColors[template.category as keyof typeof categoryColors]}`}>
                    <CategoryIcon className="w-3 h-3 mr-1" />
                    {template.category.charAt(0).toUpperCase() + template.category.slice(1)}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground bg-background/50 px-2 py-1 rounded-full">
              <Users className="w-3 h-3" />
              <span>{template.usageCount}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <CardDescription className="mb-4 line-clamp-2">{template.description}</CardDescription>

          {/* Tags section removed - not available in AgentTemplateModel */}

          {template.previewPrompts && template.previewPrompts.length > 0 && (
            <div className="mb-4 bg-muted/10 p-3 rounded-md">
              <p className="text-sm font-medium mb-2 flex items-center">
                <svg className="w-4 h-4 mr-1.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Example prompts:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2">
                {template.previewPrompts.slice(0, 2).map((prompt: string, index: number) => (
                  <li key={index} className="truncate flex items-start">
                    <span className="mr-1.5 text-primary">•</span> {prompt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button onClick={() => handleSelectTemplate(template)} className="w-full" size="sm">
            Use Template
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline">
              <Sparkles className="w-4 h-4 mr-2" />
              Browse Templates
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col p-6 gap-6">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Agent Templates
            </DialogTitle>
            <DialogDescription className="text-base mt-1">Choose from pre-built agent templates to quickly create specialized agents.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input placeholder="Search templates..." value={searchQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)} className="pl-10 h-10" />
            </div>
            <div className="w-full sm:w-56">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-10 px-3">
                    <span className="truncate mr-1">{selectedCategory === 'all' ? 'All Categories' : selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}</span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuRadioGroup value={selectedCategory} onValueChange={setSelectedCategory}>
                    <DropdownMenuRadioItem value="all">All Categories</DropdownMenuRadioItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioItem value="general">General</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="coding">Coding</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="creative">Creative</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="analysis">Analysis</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="support">Support</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-muted-foreground">Loading templates...</div>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-muted-foreground">No templates found</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">{filteredTemplates.map(renderTemplateCard)}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
