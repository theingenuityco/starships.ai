'use client'


import React from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels'

interface ModelSelectorProps {
  selectedModel: string
  onModelChange: (model: string) => void
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange }) => {
  const { data: openRouterModels, isLoading } = useOpenRouterModels()

  const models = openRouterModels?.map(m => m.id) || []

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">Model</Label>
      <Select value={selectedModel} onValueChange={onModelChange} disabled={isLoading}>
        <SelectTrigger className="text-xs">
          <SelectValue placeholder={isLoading ? "Loading models..." : "Select a model"} />
        </SelectTrigger>
        <SelectContent>
          {models.map(model => (
            <SelectItem key={model} value={model} className="text-xs">
              {model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
