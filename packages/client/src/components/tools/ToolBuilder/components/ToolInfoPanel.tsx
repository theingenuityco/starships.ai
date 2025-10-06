'use client'

import React, { useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Wrench } from 'lucide-react'
import type { ToolFormData, FormErrors } from '../types'

interface ToolInfoPanelProps {
  formData: ToolFormData
  errors: FormErrors
  onFieldChange: (field: keyof ToolFormData, value: string) => void
}

export const ToolInfoPanel: React.FC<ToolInfoPanelProps> = ({ formData, errors, onFieldChange }) => {
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize description textarea on mount and when description changes
  useEffect(() => {
    const textarea = descriptionTextareaRef.current
    if (textarea && formData.description) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [formData.description])

  return (
    <div className="frosted-glass-card rounded-xl shadow-frosted-lg p-3 w-full">
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 shadow-sm flex items-center justify-center flex-shrink-0">
          <Wrench className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <Input
            placeholder="Tool name..."
            value={formData.name}
            onChange={e => onFieldChange('name', e.target.value)}
            className={`text-sm font-semibold h-auto py-0.5 px-1.5 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 ${errors.name ? 'text-destructive' : ''}`}
          />
          <Textarea
            ref={descriptionTextareaRef}
            placeholder="Brief description..."
            value={formData.description}
            onChange={e => {
              onFieldChange('description', e.target.value)
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
  )
}
