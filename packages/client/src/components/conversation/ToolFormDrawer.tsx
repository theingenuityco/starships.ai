'use client'

import React, { forwardRef, useImperativeHandle, useState, useMemo } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Wrench, Package, Bot, BarChart2, Users, Sparkles, Save, X, Maximize2 } from 'lucide-react'
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

interface ToolFormDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: (data: ToolFormData) => void
  starshipId?: string
}

export interface ToolFormDrawerRef {
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

export const ToolFormDrawer = forwardRef<ToolFormDrawerRef, ToolFormDrawerProps>(({ open, onOpenChange, onSave, starshipId }, ref) => {
  const [formData, setFormData] = useState<ToolFormData>(INITIAL_FORM_DATA)
  const [errors, setErrors] = useState<Partial<Record<keyof ToolFormData, string>>>({})
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false)

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent className="w-full sm:max-w-2xl !inset-y-6 !right-6 !h-[calc(100vh-3rem)] !rounded-2xl !p-0" hideOverlay onInteractOutside={e => e.preventDefault()}>
        <ScrollArea className="h-full">
          <div className="p-6 space-y-6">
            <SheetTitle className="sr-only">Tool Form</SheetTitle>

            {/* Header */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-[46px] w-[46px] rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 shadow-sm flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <Input
                    id="tool-name-header"
                    placeholder="Enter tool name..."
                    value={formData.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    className={`text-xl font-semibold h-auto py-2 px-3 bg-background/50 border-border/60 focus-visible:border-primary/50 ${errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  />
                  {errors.name && <p className="text-xs text-destructive mt-1.5">{errors.name}</p>}
                </div>
              </div>
              <div>
                <Textarea
                  id="tool-description-header"
                  placeholder="Describe what this tool does..."
                  value={formData.description}
                  onChange={e => handleFieldChange('description', e.target.value)}
                  className={`text-sm resize-none bg-background/50 border-border/60 focus-visible:border-primary/50 ${errors.description ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  rows={2}
                />
                {errors.description && <p className="text-xs text-destructive mt-1.5">{errors.description}</p>}
              </div>
            </div>

            {/* Form Sections */}
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="px-1">
                <h3 className="text-base font-semibold mb-4 flex items-center gap-2 text-foreground">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Basic Information
                </h3>
                <div className="space-y-4">
                  {/* Category */}
                  <div className="space-y-2">
                    <Label htmlFor="tool-category" className="text-foreground">
                      Category
                    </Label>
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

                  {/* Blueprint Visualization */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="tool-blueprint" className="text-foreground">
                        Blueprint
                      </Label>
                      {parsedBlueprint && parsedBlueprint.nodes && parsedBlueprint.nodes.length > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsFullScreenOpen(true)} className="h-7 px-2 text-xs">
                          <Maximize2 className="w-3 h-3 mr-1" />
                          Full Screen
                        </Button>
                      )}
                    </div>
                    {parsedBlueprint && parsedBlueprint.nodes && parsedBlueprint.nodes.length > 0 ? (
                      <div className="border border-border/60 rounded-lg overflow-hidden">
                        <BlueprintVisualization blueprint={parsedBlueprint} className="h-[400px]" />
                      </div>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center border border-border/60 rounded-lg bg-muted/10">
                        <p className="text-muted-foreground text-sm">No blueprint defined yet</p>
                      </div>
                    )}
                    {errors.blueprint && <p className="text-sm text-destructive mt-2">{errors.blueprint}</p>}
                    <p className="text-xs text-muted-foreground">Workflow blueprint visualization for this tool</p>
                  </div>
                </div>
              </div>

              {/* Configuration */}
              <div className="px-1">
                <h3 className="text-base font-semibold mb-4 flex items-center gap-2 text-foreground">
                  <Package className="w-5 h-5 text-primary" />
                  Configuration
                </h3>
                <div className="space-y-4">
                  {/* Example Usage */}
                  <div className="space-y-2">
                    <Label htmlFor="tool-example" className="text-foreground">
                      Example Usage
                    </Label>
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
              </div>

              {/* Technical Details */}
              <div className="px-1">
                <h3 className="text-base font-semibold mb-4 flex items-center gap-2 text-foreground">
                  <Bot className="w-5 h-5 text-primary" />
                  Technical Details
                </h3>
                <div className="space-y-4">
                  {/* Parameters Schema */}
                  <div className="space-y-2">
                    <Label htmlFor="tool-parameters" className="text-foreground">
                      Parameters Schema (JSON)
                    </Label>
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
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-border/40">
                <Button size="lg" className="flex-1 shadow-lg hover:shadow-xl" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Tool
                </Button>
                <Button size="lg" variant="outline" className="hover:bg-muted/50" onClick={() => onOpenChange(false)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>

      {/* Full Screen Blueprint Dialog */}
      <Dialog open={isFullScreenOpen} onOpenChange={setIsFullScreenOpen}>
        <DialogContent className="max-w-[calc(100vw-3rem)] w-[calc(100vw-3rem)] h-[calc(100vh-3rem)] p-0 gap-0 flex flex-col">
          <DialogHeader className="px-6 py-4 border-b border-border/60 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-primary" />
              Blueprint Visualization - {formData.name || 'Tool'}
            </DialogTitle>
          </DialogHeader>
          <div
            className="flex-1 min-h-0 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(156, 163, 175, 0.3) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            {parsedBlueprint && parsedBlueprint.nodes && parsedBlueprint.nodes.length > 0 ? (
              <BlueprintVisualization blueprint={parsedBlueprint} className="h-full w-full" />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground">No blueprint defined yet</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
})

ToolFormDrawer.displayName = 'ToolFormDrawer'
