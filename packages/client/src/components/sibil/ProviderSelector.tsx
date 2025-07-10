'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface ProviderSelectorProps {
  provider: 'openai' | 'anthropic'
  model?: string
  onProviderChange: (provider: 'openai' | 'anthropic') => void
  onModelChange: (model: string) => void
  disabled?: boolean
}

const MODELS = {
  openai: [
    { id: 'gpt-4', name: 'GPT-4', description: 'Most capable model' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Faster and cheaper' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient' },
  ],
  anthropic: [
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Balanced' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fast and light' },
  ],
}

export function ProviderSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled = false
}: ProviderSelectorProps) {
  const currentModels = MODELS[provider]
  const currentModel = model || currentModels[0].id

  return (
    <div className="flex items-center gap-3">
      {/* Provider Selection */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Provider:</span>
        <div className="flex gap-1">
          <Badge
            variant={provider === 'openai' ? 'default' : 'outline'}
            className={`cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onProviderChange('openai')}
          >
            OpenAI
          </Badge>
          <Badge
            variant={provider === 'anthropic' ? 'default' : 'outline'}
            className={`cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onProviderChange('anthropic')}
          >
            Anthropic
          </Badge>
        </div>
      </div>

      {/* Model Selection */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Model:</span>
        <Select value={currentModel} onValueChange={onModelChange} disabled={disabled}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currentModels.map((modelOption) => (
              <SelectItem key={modelOption.id} value={modelOption.id}>
                <div>
                  <div className="font-medium">{modelOption.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {modelOption.description}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}