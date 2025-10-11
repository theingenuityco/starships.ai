import { Braces } from 'lucide-react'
import Icon from '@/components/primitives/Icon'
'use client'

import React from 'react'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type { ToolFormData, FormErrors } from '../types'
import { ParameterEditor } from './ParameterEditor'

interface ParametersPanelProps {
  formData: ToolFormData
  errors: FormErrors
  onFieldChange: (field: keyof ToolFormData, value: string | boolean) => void
}

export const ParametersPanel: React.FC<ParametersPanelProps> = ({ formData, errors, onFieldChange }) => {
  return (
    <Collapsible defaultOpen={false}>
      <div className="frosted-glass-card rounded-xl shadow-frosted-lg overflow-hidden w-full">
        <CollapsibleTrigger className="w-full p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Braces className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Tool Inputs</span>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/40">
            <ScrollArea className="max-h-[calc(100vh-14rem)]">
              <ParameterEditor value={formData.parameters} onChange={value => onFieldChange('parameters', value)} error={errors.parameters} />
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
