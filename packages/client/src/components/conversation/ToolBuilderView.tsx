'use client'

import React, { forwardRef, useImperativeHandle, useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Wrench, Package, Bot, BarChart2, Users, Sparkles, Save, X, Settings2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolTemplateCategory } from '@starships/protocol'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import type { Blueprint } from '@starships/autopilot'

interface ToolFormData {
  name: string
  description: string
  category: ToolTemplateCategory
  exampleUsage: string
  requiresApiKey: boolean
  parameters: string // JSON string for the parameters schema
  blueprint: string // JSON string for the blueprint
}

interface ToolBuilderViewProps {
  onSave?: (data: ToolFormData) => void
  onCancel?: () => void
  starshipId?: string
}

export interface ToolBuilderViewRef {
  updateField: (field: keyof ToolFormData, value: string | boolean) => void
  getFormData: () => ToolFormData
  resetForm: () => void
}

const INITIAL_FORM_DATA: ToolFormData = {
  name: '',
  description: '',
  category: 'general',
  exampleUsage: '',
  requiresApiKey: false,
  parameters: JSON.stringify(
    {
      type: 'object',
      properties: {},
      required: [],
    },
    null,
    2
  ),
  blueprint: JSON.stringify(
    {
      nodes: [],
      edges: [],
    },
    null,
    2
  ),
}

export const ToolBuilderView = forwardRef<ToolBuilderViewRef, ToolBuilderViewProps>(({ onSave, onCancel, starshipId }, ref) => {
  const [formData, setFormData] = useState<ToolFormData>(INITIAL_FORM_DATA)
  const [errors, setErrors] = useState<Partial<Record<keyof ToolFormData, string>>>({})
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const descriptionTextareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Parse blueprint for visualization
  const parsedBlueprint = useMemo<Blueprint | null>(() => {
    try {
      return JSON.parse(formData.blueprint)
    } catch {
      return null
    }
  }, [formData.blueprint])

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    updateField: (field: keyof ToolFormData, value: string | boolean) => {
      setFormData(prev => ({
        ...prev,
        [field]: value,
      }))
      // Clear error for this field when updated
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    },
    getFormData: () => formData,
    resetForm: () => {
      setFormData(INITIAL_FORM_DATA)
      setErrors({})
    },
  }))

  const getCategoryIcon = (category: ToolTemplateCategory) => {
    switch (category) {
      case 'automation':
        return <Bot className="w-5 h-5" />
      case 'data':
        return <BarChart2 className="w-5 h-5" />
      case 'communication':
        return <Users className="w-5 h-5" />
      case 'utility':
        return <Package className="w-5 h-5" />
      default:
        return <Wrench className="w-5 h-5" />
    }
  }

  const getCategoryColor = (category: ToolTemplateCategory) => {
    const colors = {
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
    return colors[category] || colors.general
  }

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ToolFormData, string>> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Tool name is required'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    // Validate JSON fields
    try {
      JSON.parse(formData.parameters)
    } catch {
      newErrors.parameters = 'Invalid JSON format'
    }

    try {
      JSON.parse(formData.blueprint)
    } catch {
      newErrors.blueprint = 'Invalid JSON format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (validateForm()) {
      onSave?.(formData)
    }
  }

  const handleFieldChange = (field: keyof ToolFormData, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }

  const categories: ToolTemplateCategory[] = ['general', 'automation', 'data', 'communication', 'coding', 'creative', 'analysis', 'support', 'utility']

  // Auto-resize description textarea on mount and when description changes
  React.useEffect(() => {
    const textarea = descriptionTextareaRef.current
    if (textarea && formData.description) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [formData.description])

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Main Blueprint Canvas - Full Height */}
      <div className="flex-1 relative">
        <div
          className="absolute bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(156, 163, 175, 0.4) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            top: 0,
            bottom: 0,
            left: '-5.5rem', // Extend background behind navigation
            right: 0,
          }}
        >
          {/* Floating Tool Info Panel - Top Left */}
          <div className="absolute top-6 left-[5.5rem] z-10">
            <div className="frosted-glass-card rounded-2xl shadow-frosted-lg p-4 min-w-[320px] max-w-[400px]">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 shadow-sm flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <Input
                    placeholder="Tool name..."
                    value={formData.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    className={`text-base font-semibold h-auto py-1 px-2 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 ${errors.name ? 'text-destructive' : ''}`}
                  />
                  <Textarea
                    ref={descriptionTextareaRef}
                    placeholder="Brief description..."
                    value={formData.description}
                    onChange={e => {
                      handleFieldChange('description', e.target.value)
                      // Auto-resize textarea
                      e.target.style.height = 'auto'
                      e.target.style.height = `${e.target.scrollHeight}px`
                    }}
                    className={`text-xs min-h-[32px] max-h-[120px] py-1 px-2 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-muted-foreground resize-none ${errors.description ? 'text-destructive' : ''}`}
                    rows={1}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Floating Action Buttons - Top Right */}
          <div className="absolute top-6 right-6 z-10 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsSettingsOpen(true)} className="gap-2 frosted-glass-card shadow-frosted-lg hover:bg-muted/50">
              <Settings2 className="w-4 h-4" />
              Settings
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} className="frosted-glass-card shadow-frosted-lg hover:bg-muted/50">
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-2 shadow-frosted-lg">
              <Save className="w-4 h-4" />
              Save Tool
            </Button>
          </div>

          {/* Blueprint or Empty State */}
          {parsedBlueprint && parsedBlueprint.nodes && parsedBlueprint.nodes.length > 0 ? (
            <BlueprintVisualization blueprint={parsedBlueprint} className="h-full w-full" transparent />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="w-20 h-20 mx-auto rounded-full frosted-glass-card shadow-frosted-lg flex items-center justify-center">
                  <Wrench className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">No Blueprint Yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Start building your tool by adding nodes and connections to create a workflow blueprint. Open settings to define the blueprint structure.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsSettingsOpen(true)} className="gap-2 frosted-glass-card shadow-frosted-lg">
                  <Settings2 className="w-4 h-4" />
                  Open Settings
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Drawer */}
      <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Tool Settings</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {/* Settings Header */}
              <div className="space-y-1">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-primary" />
                  Tool Settings
                </h2>
                <p className="text-sm text-muted-foreground">Configure your tool's properties and behavior</p>
              </div>

              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-base font-semibold flex items-center gap-2 text-foreground">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Basic Information
                </h3>

                {/* Tool Name */}
                <div className="space-y-2">
                  <Label htmlFor="tool-name">Tool Name</Label>
                  <Input
                    id="tool-name"
                    placeholder="Enter tool name..."
                    value={formData.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="tool-description">Description</Label>
                  <Textarea
                    id="tool-description"
                    placeholder="Describe what this tool does..."
                    value={formData.description}
                    onChange={e => handleFieldChange('description', e.target.value)}
                    className={errors.description ? 'border-destructive focus-visible:ring-destructive' : ''}
                    rows={3}
                  />
                  {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label>Category</Label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => (
                      <Badge
                        key={cat}
                        variant="outline"
                        className={cn(
                          'cursor-pointer transition-all duration-200 gap-1.5 px-3 py-1.5 rounded-full [&>svg]:w-3.5 [&>svg]:h-3.5',
                          formData.category === cat ? cn('shadow-sm hover:shadow-md hover:brightness-110', getCategoryColor(cat)) : 'hover:bg-muted/50 hover:border-primary/40'
                        )}
                        onClick={() => handleFieldChange('category', cat)}
                      >
                        {getCategoryIcon(cat)}
                        <span className="capitalize">{cat}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Configuration */}
              <div className="space-y-4">
                <h3 className="text-base font-semibold flex items-center gap-2 text-foreground">
                  <Package className="w-5 h-5 text-primary" />
                  Configuration
                </h3>

                {/* Example Usage */}
                <div className="space-y-2">
                  <Label htmlFor="tool-example">Example Usage</Label>
                  <Textarea id="tool-example" placeholder="Show how to use this tool..." value={formData.exampleUsage} onChange={e => handleFieldChange('exampleUsage', e.target.value)} rows={3} />
                </div>

                {/* Requires API Key */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/10 border border-border/40">
                  <input
                    type="checkbox"
                    id="tool-requires-api-key"
                    checked={formData.requiresApiKey}
                    onChange={e => handleFieldChange('requiresApiKey', e.target.checked)}
                    className="w-4 h-4 rounded border-input text-primary focus:ring-primary focus:ring-offset-background"
                  />
                  <Label htmlFor="tool-requires-api-key" className="cursor-pointer flex-1 text-foreground">
                    Requires API Key
                  </Label>
                </div>
              </div>

              {/* Technical Details */}
              <div className="space-y-4">
                <h3 className="text-base font-semibold flex items-center gap-2 text-foreground">
                  <Bot className="w-5 h-5 text-primary" />
                  Technical Details
                </h3>

                {/* Parameters Schema */}
                <div className="space-y-2">
                  <Label htmlFor="tool-parameters">Parameters Schema (JSON)</Label>
                  <Textarea
                    id="tool-parameters"
                    placeholder='{"type": "object", "properties": {...}}'
                    value={formData.parameters}
                    onChange={e => handleFieldChange('parameters', e.target.value)}
                    className={`font-mono text-xs ${errors.parameters ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    rows={8}
                  />
                  {errors.parameters && <p className="text-sm text-destructive">{errors.parameters}</p>}
                  <p className="text-xs text-muted-foreground">Define the input parameters for this tool in JSON format</p>
                </div>

                {/* Blueprint JSON */}
                <div className="space-y-2">
                  <Label htmlFor="tool-blueprint">Blueprint Structure (JSON)</Label>
                  <Textarea
                    id="tool-blueprint"
                    placeholder='{"nodes": [...], "edges": [...]}'
                    value={formData.blueprint}
                    onChange={e => handleFieldChange('blueprint', e.target.value)}
                    className={`font-mono text-xs ${errors.blueprint ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    rows={12}
                  />
                  {errors.blueprint && <p className="text-sm text-destructive">{errors.blueprint}</p>}
                  <p className="text-xs text-muted-foreground">Define the workflow blueprint structure in JSON format</p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
})

ToolBuilderView.displayName = 'ToolBuilderView'
