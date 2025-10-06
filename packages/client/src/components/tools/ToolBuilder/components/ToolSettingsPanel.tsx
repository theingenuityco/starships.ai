'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Settings2, Plus } from 'lucide-react'
import type { ToolFormData, FormErrors, Parameter } from '../types'
import { CategorySelector } from './CategorySelector'
import { ParameterEditor } from './ParameterEditor'

interface ToolSettingsPanelProps {
  formData: ToolFormData
  errors: FormErrors
  parameters: Parameter[]
  onFieldChange: (field: keyof ToolFormData, value: string | boolean) => void
  onAddParameter: (path?: number[]) => void
  onUpdateParameter: (path: number[], field: keyof Parameter, value: any) => void
  onRemoveParameter: (path: number[]) => void
  onToggleExpanded: (path: number[]) => void
}

export const ToolSettingsPanel: React.FC<ToolSettingsPanelProps> = ({ formData, errors, parameters, onFieldChange, onAddParameter, onUpdateParameter, onRemoveParameter, onToggleExpanded }) => {
  return (
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
                <CategorySelector selectedCategory={formData.category} onCategoryChange={value => onFieldChange('category', value)} />

                {/* Example Usage */}
                <div className="space-y-1.5">
                  <Label htmlFor="tool-example" className="text-xs font-medium">
                    Example Usage
                  </Label>
                  <Textarea
                    id="tool-example"
                    placeholder="Show how to use this tool..."
                    value={formData.exampleUsage}
                    onChange={e => onFieldChange('exampleUsage', e.target.value)}
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
                    onChange={e => onFieldChange('requiresApiKey', e.target.checked)}
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
                    <Button type="button" variant="outline" size="sm" onClick={() => onAddParameter()} className="h-6 text-xs gap-1 hover:bg-primary/10 hover:border-primary/40">
                      <Plus className="w-3 h-3" />
                      Add Parameter
                    </Button>
                  </div>
                  <ParameterEditor parameters={parameters} onAdd={onAddParameter} onUpdate={onUpdateParameter} onRemove={onRemoveParameter} onToggleExpanded={onToggleExpanded} />
                  {errors.parameters && <p className="text-xs text-destructive">{errors.parameters}</p>}
                </div>
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
