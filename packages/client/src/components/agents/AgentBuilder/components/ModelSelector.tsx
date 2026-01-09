'use client'


import React from 'react'
import { Label } from '@/components/ui/label'
import { useLlmModels } from '@/hooks/useLlmModels'
import { StandardSelect } from './StandardSelect'

interface ModelSelectorProps {
  selectedModel: string
  onModelChange: (model: string) => void
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange }) => {
  const { data: llmModels, isLoading } = useLlmModels()

  const models = llmModels?.map(m => m.model) || []

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">Model</Label>
      <StandardSelect
        mode="single"
        aria-label="Select model"
        disabled={isLoading}
        value={selectedModel}
        options={models.map(model => ({ value: model }))}
        placeholder={isLoading ? 'Loading models...' : 'Select a model'}
        searchPlaceholder="Search models..."
        emptyLabel={isLoading ? 'Loading models…' : 'No models found.'}
        renderTriggerLabel={({ selectedOptions }) => {
          const selected = selectedOptions[0]?.value || selectedModel
          if (!selected) {
            return <span className="text-xs text-muted-foreground">{isLoading ? 'Loading models...' : 'Select a model'}</span>
          }
          return (
            <span className="text-xs font-mono truncate max-w-full">
              {selected}
            </span>
          )
        }}
        onChange={m => {
          if (typeof m === 'string') onModelChange(m)
        }}
      />
    </div>
  )
}
