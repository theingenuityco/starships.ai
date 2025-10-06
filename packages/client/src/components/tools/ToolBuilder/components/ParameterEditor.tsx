'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Parameter } from '../types'

interface ParameterEditorProps {
  parameters: Parameter[]
  onAdd: (path?: number[]) => void
  onUpdate: (path: number[], field: keyof Parameter, value: any) => void
  onRemove: (path: number[]) => void
  onToggleExpanded: (path: number[]) => void
}

export const ParameterEditor: React.FC<ParameterEditorProps> = ({ parameters, onAdd, onUpdate, onRemove, onToggleExpanded }) => {
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
              <Button type="button" variant="ghost" size="icon" onClick={() => onToggleExpanded(path)} className="h-6 w-6 hover:bg-muted flex-shrink-0">
                {param.isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </Button>
            ) : null}

            {/* Name */}
            <Input
              placeholder="param_name"
              value={param.name}
              onChange={e => onUpdate(path, 'name', e.target.value)}
              className="h-6 flex-1 text-xs font-mono border-none bg-transparent focus-visible:ring-1 px-2"
            />

            {/* Type Selector */}
            <Select value={param.type} onValueChange={value => onUpdate(path, 'type', value)}>
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
              onClick={() => onUpdate(path, 'required', !param.required)}
            >
              {param.required ? 'Required' : 'Optional'}
            </Badge>

            {/* Delete */}
            <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(path)} className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>

          {/* Description Row */}
          <Input
            placeholder="Description (optional)"
            value={param.description}
            onChange={e => onUpdate(path, 'description', e.target.value)}
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
              <Button type="button" variant="outline" size="sm" onClick={() => onAdd([...path])} className="h-6 text-xs gap-1 hover:bg-primary/10 hover:border-primary/40 w-full">
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

  if (parameters.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-6 border-2 border-dashed rounded-lg bg-muted/5">
        <p className="font-medium mb-1">No parameters defined</p>
        <p className="text-[10px]">Click &ldquo;Add Parameter&rdquo; to create tool inputs</p>
      </div>
    )
  }

  return <div className="space-y-2">{parameters.map((param, index) => renderParameter(param, [index]))}</div>
}
