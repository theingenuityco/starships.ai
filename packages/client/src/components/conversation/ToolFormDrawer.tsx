'use client'

import React, { forwardRef, useImperativeHandle, useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Wrench, Package, Bot, BarChart2, Users, Sparkles, Save, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { ToolTemplateCategory } from '@starships/protocol'

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
        <ScrollArea className="h-full p-6">
          <div className="space-y-6">
            <SheetHeader className="space-y-4 overflow-visible">
              {/* Main Header with Icon and Editable Title */}
              <div className="flex items-start gap-4 overflow-visible">
                <div className="flex-shrink-0 p-4 rounded-xl bg-primary/10 border border-primary/20 transition-all hover:bg-primary/20 hover:border-primary/30 mt-1.5">
                  <Wrench className="w-8 h-8 text-primary" />
                </div>
                <div className="flex-1 space-y-2 overflow-visible">
                  <div className="px-1.5 pt-1.5">
                    <Input
                      id="tool-name-header"
                      placeholder="Enter tool name..."
                      value={formData.name}
                      onChange={e => handleFieldChange('name', e.target.value)}
                      className={`text-2xl font-bold h-auto py-2 px-3 ${errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    />
                    {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
                  </div>
                  <div className="px-1.5 pb-1.5">
                    <Textarea
                      id="tool-description-header"
                      placeholder="Describe what this tool does..."
                      value={formData.description}
                      onChange={e => handleFieldChange('description', e.target.value)}
                      className={`text-base resize-none ${errors.description ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      rows={2}
                    />
                    {errors.description && <p className="text-sm text-destructive mt-1">{errors.description}</p>}
                  </div>
                </div>
              </div>
            </SheetHeader>

            {/* Form Sections */}
            <div className="space-y-6 border-t border-border/40 pt-6">
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
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => handleFieldChange('category', cat)}
                          className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                            formData.category === cat ? `${getCategoryColor(cat)} border-2` : 'border-border/40 bg-muted/5 hover:bg-muted/10 hover:border-border/60'
                          }`}
                        >
                          {getCategoryIcon(cat)}
                          <span className="text-sm font-medium capitalize">{cat}</span>
                        </button>
                      ))}
                    </div>
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

                  {/* Blueprint */}
                  <div className="space-y-2">
                    <Label htmlFor="tool-blueprint" className="text-foreground">
                      Blueprint (JSON)
                    </Label>
                    <Textarea
                      id="tool-blueprint"
                      placeholder='{"nodes": [], "edges": []}'
                      value={formData.blueprint}
                      onChange={e => handleFieldChange('blueprint', e.target.value)}
                      className={`font-mono text-xs ${errors.blueprint ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      rows={8}
                    />
                    {errors.blueprint && <p className="text-sm text-destructive">{errors.blueprint}</p>}
                    <p className="text-xs text-muted-foreground">Define the workflow blueprint for this tool</p>
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
    </Sheet>
  )
})

ToolFormDrawer.displayName = 'ToolFormDrawer'
