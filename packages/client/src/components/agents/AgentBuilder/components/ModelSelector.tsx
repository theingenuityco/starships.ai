'use client'


import React from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DEFAULT_MODELS } from '../constants'

interface ModelSelectorProps {
  selectedModel: string
  onModelChange: (model: string) => void
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange }) => {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">Model</Label>
      <Select value={selectedModel} onValueChange={onModelChange}>
        <SelectTrigger className="text-xs">
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {DEFAULT_MODELS.map(model => (
            <SelectItem key={model} value={model} className="text-xs">
              {model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
