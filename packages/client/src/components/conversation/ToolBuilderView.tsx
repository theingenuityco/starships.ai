'use client'

import React, { forwardRef, useImperativeHandle, useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Wrench, Package, Bot, BarChart2, Users, Sparkles, Settings2, ChevronDown, ChevronRight, Plus, Trash2, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolTemplateCategory } from '@starships/protocol'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import type { Blueprint } from '@starships/autopilot'

interface Parameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required: boolean
  properties?: Parameter[] // For object type
  items?: Parameter // For array type - the schema for array items
  isExpanded?: boolean // UI state for collapsible nested parameters
}

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
  const [parameters, setParameters] = useState<Parameter[]>([])
  const descriptionTextareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Parse parameters from JSON on mount and when formData.parameters changes
  React.useEffect(() => {
    try {
      const parsed = JSON.parse(formData.parameters)

      // Recursive function to convert JSON schema to Parameter
      const jsonToParam = (name: string, schema: any, isRequired: boolean): Parameter => {
        const param: Parameter = {
          name,
          type: schema.type || 'string',
          description: schema.description || '',
          required: isRequired,
        }

        // Parse nested object properties
        if (schema.type === 'object' && schema.properties) {
          param.properties = Object.entries(schema.properties).map(([propName, propSchema]: [string, any]) => jsonToParam(propName, propSchema, schema.required?.includes(propName) || false))
        }

        // Parse array items
        if (schema.type === 'array' && schema.items) {
          param.items = jsonToParam('item', schema.items, false)
        }

        return param
      }

      if (parsed.properties) {
        const params: Parameter[] = Object.entries(parsed.properties).map(([name, prop]: [string, any]) => jsonToParam(name, prop, parsed.required?.includes(name) || false))
        setParameters(params)
      } else {
        setParameters([])
      }
    } catch {
      // Invalid JSON, keep empty parameters
      setParameters([])
    }
  }, [formData.parameters])

  // Convert parameters to JSON schema (with nested support)
  const parametersToJSON = React.useCallback((params: Parameter[]) => {
    const properties: Record<string, any> = {}
    const required: string[] = []

    const paramToSchema = (param: Parameter): any => {
      const schema: any = {
        type: param.type,
        description: param.description,
      }

      // Handle nested object properties
      if (param.type === 'object' && param.properties && param.properties.length > 0) {
        schema.properties = {}
        schema.required = []
        param.properties.forEach(prop => {
          schema.properties[prop.name] = paramToSchema(prop)
          if (prop.required) {
            schema.required.push(prop.name)
          }
        })
        if (schema.required.length === 0) {
          delete schema.required
        }
      }

      // Handle array items
      if (param.type === 'array' && param.items) {
        schema.items = paramToSchema(param.items)
      }

      return schema
    }

    params.forEach(param => {
      properties[param.name] = paramToSchema(param)
      if (param.required) {
        required.push(param.name)
      }
    })

    return JSON.stringify(
      {
        type: 'object',
        properties,
        required,
      },
      null,
      2
    )
  }, [])

  // Add new parameter (with path support for nested parameters)
  const addParameter = (path: number[] = []) => {
    const newParams = [...parameters]

    if (path.length === 0) {
      // Add to root level
      newParams.push({ name: '', type: 'string' as const, description: '', required: false })
    } else {
      // Add to nested level - navigate to parent
      let target: any = newParams
      let parentParam: Parameter | undefined

      for (let i = 0; i < path.length; i++) {
        const index = path[i]

        if (i === path.length - 1) {
          // Last element - this is the parent we want to add to
          if (index === -1 && target.items) {
            parentParam = target.items
          } else {
            parentParam = target[index]
          }
        } else {
          // Navigate deeper
          if (index === -1) {
            // Navigate through array items
            if (target.items) {
              target = target.items
            }
          } else {
            const currentParam = target[index]
            if (currentParam.type === 'object' && currentParam.properties) {
              target = currentParam.properties
            } else if (currentParam.type === 'array' && currentParam.items) {
              target = currentParam
            }
          }
        }
      }

      // Add new property to the parent
      if (parentParam && parentParam.type === 'object') {
        if (!parentParam.properties) parentParam.properties = []
        parentParam.properties.push({ name: '', type: 'string' as const, description: '', required: false })
      }
    }

    setParameters(newParams)
    const json = parametersToJSON(newParams)
    handleFieldChange('parameters', json)
  }

  // Update parameter (with path support for nested parameters)
  const updateParameter = (path: number[], field: keyof Parameter, value: any) => {
    const newParams = [...parameters]

    let target: any = newParams
    let param: Parameter

    // Navigate to the target parameter
    for (let i = 0; i < path.length; i++) {
      const index = path[i]

      if (i === path.length - 1) {
        // Last element in path - this is our target
        if (index === -1 && target.items) {
          // Array item schema
          param = target.items
        } else {
          param = target[index]
        }
      } else {
        // Navigate deeper
        if (index === -1) {
          // Navigate through array items
          if (target.items) {
            target = target.items
          }
        } else {
          const currentParam = target[index]
          if (currentParam.type === 'object' && currentParam.properties) {
            target = currentParam.properties
          } else if (currentParam.type === 'array' && currentParam.items) {
            target = currentParam
          }
        }
      }
    }

    param = param!
    const oldType = param.type

    // Type-safe update
    if (field === 'name' || field === 'description') {
      param[field] = value as string
    } else if (field === 'type') {
      param[field] = value as Parameter['type']
    } else if (field === 'required') {
      param[field] = value as boolean
    } else if (field === 'isExpanded') {
      param[field] = value as boolean
    }

    // Initialize nested structures when type changes
    if (field === 'type') {
      if (value === 'object' && oldType !== 'object') {
        param.properties = []
        param.isExpanded = false
      } else if (value === 'array' && oldType !== 'array') {
        param.items = { name: 'item', type: 'string', description: '', required: false }
        param.isExpanded = false
      } else if (value !== 'object' && value !== 'array') {
        delete param.properties
        delete param.items
        delete param.isExpanded
      } else if (value === 'object' && oldType === 'array') {
        delete param.items
      } else if (value === 'array' && oldType === 'object') {
        delete param.properties
      }
    }

    setParameters(newParams)
    const json = parametersToJSON(newParams)
    handleFieldChange('parameters', json)
  }

  // Remove parameter (with path support for nested parameters)
  const removeParameter = (path: number[]) => {
    const newParams = [...parameters]

    if (path.length === 1) {
      // Remove from root level
      newParams.splice(path[0], 1)
    } else {
      // Remove from nested level
      let target = newParams
      for (let i = 0; i < path.length - 1; i++) {
        const param = target[path[i]]
        if (param.type === 'object' && param.properties) {
          target = param.properties
        }
      }
      target.splice(path[path.length - 1], 1)
    }

    setParameters(newParams)
    const json = parametersToJSON(newParams)
    handleFieldChange('parameters', json)
  }

  // Toggle expand/collapse for object and array parameters
  const toggleExpanded = (path: number[]) => {
    const newParams = [...parameters]

    let target: any = newParams
    let param: Parameter | undefined

    // Navigate to the target parameter
    for (let i = 0; i < path.length; i++) {
      const index = path[i]

      if (i === path.length - 1) {
        // Last element in path - this is our target
        if (index === -1 && target.items) {
          // Array item schema
          param = target.items
        } else {
          param = target[index]
        }
      } else {
        // Navigate deeper
        if (index === -1) {
          // Navigate through array items
          if (target.items) {
            target = target.items
          }
        } else {
          const currentParam = target[index]
          if (currentParam.type === 'object' && currentParam.properties) {
            target = currentParam.properties
          } else if (currentParam.type === 'array' && currentParam.items) {
            target = currentParam
          }
        }
      }
    }

    if (param) {
      param.isExpanded = !param.isExpanded
      setParameters(newParams)
    }
  }

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

  // Recursive component to render parameters
  const renderParameter = (param: Parameter, path: number[], level: number = 0): React.ReactNode => {
    const indentClass = level > 0 ? 'ml-4 border-l-2 border-primary/20 pl-2' : ''

    return (
      <div key={path.join('-')} className={cn('space-y-2', indentClass)}>
        <div className="p-2 border rounded-md bg-background hover:border-primary/30 transition-all group space-y-1.5">
          {/* Main Row */}
          <div className="flex items-center gap-1.5">
            {/* Expand/Collapse for objects and arrays */}
            {param.type === 'object' || param.type === 'array' ? (
              <Button type="button" variant="ghost" size="icon" onClick={() => toggleExpanded(path)} className="h-6 w-6 hover:bg-muted flex-shrink-0">
                {param.isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </Button>
            ) : null}

            {/* Name */}
            <Input
              placeholder="param_name"
              value={param.name}
              onChange={e => updateParameter(path, 'name', e.target.value)}
              className="h-6 flex-1 text-xs font-mono border-none bg-transparent focus-visible:ring-1 px-2"
            />

            {/* Type Selector */}
            <Select value={param.type} onValueChange={value => updateParameter(path, 'type', value)}>
              <SelectTrigger className="h-6 w-20 text-[10px] border-none bg-muted/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-20 min-w-0">
                <SelectItem value="string" className="text-[10px]">
                  String
                </SelectItem>
                <SelectItem value="number" className="text-[10px]">
                  Number
                </SelectItem>
                <SelectItem value="boolean" className="text-[10px]">
                  Boolean
                </SelectItem>
                <SelectItem value="object" className="text-[10px]">
                  Object
                </SelectItem>
                <SelectItem value="array" className="text-[10px]">
                  Array
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Required Toggle */}
            <Badge
              variant="outline"
              className={cn(
                'h-6 w-[60px] px-2 text-[10px] cursor-pointer transition-all flex-shrink-0 justify-center',
                param.required ? 'bg-muted/30 text-foreground border-border/50 hover:bg-muted/40' : 'bg-muted/10 text-muted-foreground border-border/30 hover:bg-muted/20'
              )}
              onClick={() => updateParameter(path, 'required', !param.required)}
            >
              {param.required ? 'Required' : 'Optional'}
            </Badge>

            {/* Delete */}
            <Button type="button" variant="ghost" size="icon" onClick={() => removeParameter(path)} className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>

          {/* Description Row */}
          <Input
            placeholder="Description (optional)"
            value={param.description}
            onChange={e => updateParameter(path, 'description', e.target.value)}
            className="h-5 text-[10px] border-none bg-muted/20 focus-visible:ring-1 px-2"
          />
        </div>

        {/* Nested properties for objects */}
        {param.type === 'object' && param.isExpanded && (
          <div className="space-y-2">
            {param.properties && param.properties.length > 0 ? (
              param.properties.map((prop, index) => renderParameter(prop, [...path, index], level + 1))
            ) : (
              <div className="ml-4 text-xs text-muted-foreground text-center py-2 border border-dashed rounded-lg bg-muted/5">No properties defined</div>
            )}
            <div className="ml-4">
              <Button type="button" variant="outline" size="sm" onClick={() => addParameter([...path])} className="h-6 text-xs gap-1 hover:bg-primary/10 hover:border-primary/40 w-full">
                <Plus className="w-3 h-3" />
                Add Property
              </Button>
            </div>
          </div>
        )}

        {/* Array items schema */}
        {param.type === 'array' && param.isExpanded && param.items && (
          <div className="space-y-2">
            <div className="ml-4 space-y-1.5">
              <Label className="text-[10px] font-medium text-muted-foreground">Array Items Schema:</Label>
              {renderParameter(param.items, [...path, -1], level + 1)}
            </div>
          </div>
        )}
      </div>
    )
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
          {/* Floating Panels - Top Left */}
          <div className="absolute top-4 left-28 z-10 w-[420px] space-y-2">
            {/* Tool Info Panel */}
            <div className="frosted-glass-card rounded-xl shadow-frosted-lg p-3 w-full">
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 shadow-sm flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <Input
                    placeholder="Tool name..."
                    value={formData.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    className={`text-sm font-semibold h-auto py-0.5 px-1.5 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 ${errors.name ? 'text-destructive' : ''}`}
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
                    className={`text-xs min-h-[28px] max-h-[100px] py-0.5 px-1.5 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-muted-foreground resize-none ${errors.description ? 'text-destructive' : ''}`}
                    rows={1}
                  />
                </div>
              </div>
            </div>

            {/* Settings Panel */}
            <Collapsible defaultOpen={false}>
              <div className="frosted-glass-card rounded-xl shadow-frosted-lg overflow-hidden w-full">
                <CollapsibleTrigger className="w-full p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-semibold">Tool Settings</span>
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t border-border/40">
                    <ScrollArea className="max-h-[calc(100vh-14rem)]">
                      <div className="p-3 space-y-3">
                        {/* Category */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Category</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {categories.map(cat => (
                              <Badge
                                key={cat}
                                variant="outline"
                                className={cn(
                                  'cursor-pointer transition-all duration-200 gap-1 px-2 py-0.5 rounded-full text-xs [&>svg]:w-3 [&>svg]:h-3',
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

                        {/* Example Usage */}
                        <div className="space-y-1.5">
                          <Label htmlFor="tool-example" className="text-xs font-medium">
                            Example Usage
                          </Label>
                          <Textarea
                            id="tool-example"
                            placeholder="Show how to use this tool..."
                            value={formData.exampleUsage}
                            onChange={e => handleFieldChange('exampleUsage', e.target.value)}
                            rows={2}
                            className="text-xs"
                          />
                        </div>

                        {/* Requires API Key */}
                        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/10 border border-border/40">
                          <input
                            type="checkbox"
                            id="tool-requires-api-key"
                            checked={formData.requiresApiKey}
                            onChange={e => handleFieldChange('requiresApiKey', e.target.checked)}
                            className="w-3 h-3 rounded border-input text-primary focus:ring-primary focus:ring-offset-background"
                          />
                          <Label htmlFor="tool-requires-api-key" className="cursor-pointer flex-1 text-xs">
                            Requires API Key
                          </Label>
                        </div>

                        {/* Parameters */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium">Parameters</Label>
                            <Button type="button" variant="outline" size="sm" onClick={() => addParameter()} className="h-6 text-xs gap-1 hover:bg-primary/10 hover:border-primary/40">
                              <Plus className="w-3 h-3" />
                              Add Parameter
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {parameters.length === 0 ? (
                              <div className="text-xs text-muted-foreground text-center py-6 border-2 border-dashed rounded-lg bg-muted/5">
                                <p className="font-medium mb-1">No parameters defined</p>
                                <p className="text-[10px]">Click "Add Parameter" to create tool inputs</p>
                              </div>
                            ) : (
                              parameters.map((param, index) => renderParameter(param, [index]))
                            )}
                          </div>
                          {errors.parameters && <p className="text-xs text-destructive">{errors.parameters}</p>}
                        </div>
                      </div>
                    </ScrollArea>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
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
                  <p className="text-sm text-muted-foreground">Start building your tool by adding nodes and connections to create a workflow blueprint. Configure tool settings above.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

ToolBuilderView.displayName = 'ToolBuilderView'
