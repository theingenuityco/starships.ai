'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Star,
  Users,
  Sparkles,
  Code,
  Palette,
  BarChart3,
  Headphones,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentTemplate } from '@/lib/api'

interface AgentTemplateSelectorProps {
  onSelectTemplate: (template: AgentTemplate) => void
  onCreateFromTemplate: (templateId: string, agentName: string) => void
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

export function AgentTemplateSelector({
  onSelectTemplate,
  onCreateFromTemplate,
  trigger,
}: AgentTemplateSelectorProps) {
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [filteredTemplates, setFilteredTemplates] = useState<AgentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null)
  const [agentName, setAgentName] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

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
      filtered = filtered.filter(
        template =>
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          template.tags.some((tag: string) => tag.toLowerCase().includes(query))
      )
    }

    setFilteredTemplates(filtered)
  }

  const handleSelectTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template)
    setAgentName(`${template.name} Copy`)
    setShowCreateDialog(true)
  }

  const handleCreateAgent = async () => {
    if (selectedTemplate && agentName.trim()) {
      try {
        // Let the parent component handle the API call
        onCreateFromTemplate(selectedTemplate.id, agentName.trim())

        // Close dialog and reset state
        setShowCreateDialog(false)
        setSelectedTemplate(null)
        setAgentName('')
      } catch (error) {
        console.error('Failed to create agent from template:', error)
        // TODO: Add error handling UI
      }
    }
  }

  const renderTemplateCard = (template: AgentTemplate) => {
    const CategoryIcon = categoryIcons[template.category as keyof typeof categoryIcons]

    return (
      <Card
        key={template.id}
        className="cursor-pointer hover:shadow-md transition-all border-border/50 hover:border-primary/30 overflow-hidden"
      >
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
                  <Badge
                    variant="outline"
                    className={`text-xs ${categoryColors[template.category as keyof typeof categoryColors]}`}
                  >
                    <CategoryIcon className="w-3 h-3 mr-1" />
                    {template.category}
                  </Badge>
                  {template.rating && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span>{template.rating}</span>
                    </div>
                  )}
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

          <div className="flex flex-wrap gap-1.5 mb-4">
            {template.tags.slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-xs px-2 py-0.5">
                {tag}
              </Badge>
            ))}
            {template.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                +{template.tags.length - 3}
              </Badge>
            )}
          </div>

          {template.previewPrompts && template.previewPrompts.length > 0 && (
            <div className="mb-4 bg-muted/10 p-3 rounded-md">
              <p className="text-sm font-medium mb-2 flex items-center">
                <svg
                  className="w-4 h-4 mr-1.5 text-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
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
            <DialogDescription className="text-base mt-1">
              Choose from pre-built agent templates to quickly create specialized agents.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
            <div className="w-full sm:w-56">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-10 px-3">
                    <span className="truncate mr-1">
                      {selectedCategory === 'all'
                        ? 'All Categories'
                        : selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}
                    </span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuRadioGroup
                    value={selectedCategory}
                    onValueChange={setSelectedCategory}
                  >
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
                {filteredTemplates.map(renderTemplateCard)}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Agent from Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Agent from Template</DialogTitle>
            <DialogDescription>
              Create a new agent based on the "{selectedTemplate?.name}" template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Agent Name</label>
              <Input
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                placeholder="Enter agent name..."
                className="mt-1"
              />
            </div>

            {selectedTemplate && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{selectedTemplate.icon}</span>
                  <span className="font-medium">{selectedTemplate.name}</span>
                </div>
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateAgent} disabled={!agentName.trim()}>
              Create Agent
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
