'use client'

import { ChevronDown, Settings2 } from 'lucide-react'
import Icon from '@/components/primitives/Icon'

import React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type { AgentFormData, FormErrors } from '../types'
import { CategorySelector } from './CategorySelector'
import { IconSelector } from './IconSelector'

interface AgentSettingsPanelProps {
  formData: AgentFormData
  errors: FormErrors
  onFieldChange: (field: keyof AgentFormData, value: string | number) => void
}

export const AgentSettingsPanel: React.FC<AgentSettingsPanelProps> = ({ formData, errors, onFieldChange }) => {
  return (
    <Collapsible defaultOpen={false}>
      <div className="frosted-glass-card rounded-xl shadow-frosted-lg overflow-hidden w-full">
        <CollapsibleTrigger className="w-full p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Agent Settings</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/40">
            <ScrollArea className="max-h-[calc(100vh-14rem)]">
              <div className="p-3 space-y-3">
                {/* Category */}
                <CategorySelector selectedCategory={formData.category} onCategoryChange={value => onFieldChange('category', value)} />

                {/* Icon */}
                <IconSelector selectedIcon={formData.icon} onIconChange={value => onFieldChange('icon', value)} />

                {/* Timeout */}
                <div className="space-y-1.5">
                  <Label htmlFor="agent-timeout" className="text-xs font-medium">
                    Timeout (ms)
                  </Label>
                  <Input
                    id="agent-timeout"
                    type="number"
                    min="1000"
                    step="1000"
                    value={formData.timeout}
                    onChange={e => onFieldChange('timeout', parseInt(e.target.value, 10) || 60000)}
                    className={`text-xs ${errors.timeout ? 'border-destructive' : ''}`}
                  />
                  <p className="text-[10px] text-muted-foreground">Maximum execution time in milliseconds</p>
                </div>
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
