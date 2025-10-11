'use client'

import Icon from '@/components/primitives/Icon'

import React, { useRef, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type { AgentFormData, FormErrors } from '../types'
import { ModelSelector } from './ModelSelector'

interface AgentConfigPanelProps {
  formData: AgentFormData
  errors: FormErrors
  onFieldChange: (field: keyof AgentFormData, value: string | number) => void
}

export const AgentConfigPanel: React.FC<AgentConfigPanelProps> = ({ formData, errors, onFieldChange }) => {
  const systemPromptTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize system prompt textarea
  useEffect(() => {
    const textarea = systemPromptTextareaRef.current
    if (textarea && formData.systemPrompt) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`
    }
  }, [formData.systemPrompt])

  return (
    <Collapsible defaultOpen={true}>
      <div className="frosted-glass-card rounded-xl shadow-frosted-lg overflow-hidden w-full">
        <CollapsibleTrigger className="w-full p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Agent Configuration</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/40">
            <ScrollArea className="max-h-[calc(100vh-14rem)]">
              <div className="p-3 space-y-3">
                {/* Model Selection */}
                <ModelSelector selectedModel={formData.model} onModelChange={value => onFieldChange('model', value)} />

                {/* Temperature */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="agent-temperature" className="text-xs font-medium">
                      Temperature
                    </Label>
                    <span className="text-xs text-muted-foreground">{formData.temperature}</span>
                  </div>
                  <Input
                    id="agent-temperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.temperature}
                    onChange={e => onFieldChange('temperature', parseFloat(e.target.value) || 0)}
                    className={`text-xs ${errors.temperature ? 'border-destructive' : ''}`}
                  />
                  <p className="text-[10px] text-muted-foreground">Lower = deterministic, Higher = creative (0-2)</p>
                </div>

                {/* Max Tokens */}
                <div className="space-y-1.5">
                  <Label htmlFor="agent-max-tokens" className="text-xs font-medium">
                    Max Tokens
                  </Label>
                  <Input
                    id="agent-max-tokens"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.maxTokens}
                    onChange={e => onFieldChange('maxTokens', parseInt(e.target.value, 10) || 2048)}
                    className={`text-xs ${errors.maxTokens ? 'border-destructive' : ''}`}
                  />
                  <p className="text-[10px] text-muted-foreground">Maximum response length</p>
                </div>

                {/* System Prompt */}
                <div className="space-y-1.5">
                  <Label htmlFor="agent-system-prompt" className="text-xs font-medium">
                    System Prompt <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    ref={systemPromptTextareaRef}
                    id="agent-system-prompt"
                    placeholder="Define the agent's character, mission, and behavior..."
                    value={formData.systemPrompt}
                    onChange={e => {
                      onFieldChange('systemPrompt', e.target.value)
                      // Auto-resize textarea
                      e.target.style.height = 'auto'
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`
                    }}
                    className={`text-xs min-h-[100px] max-h-[300px] resize-none font-mono ${errors.systemPrompt ? 'border-destructive' : ''}`}
                    rows={5}
                  />
                  <p className="text-[10px] text-muted-foreground">Core personality and instructions for this agent</p>
                </div>
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
