'use client'

import { useState } from 'react'
import { Check, ChevronDown, Brain, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ProviderSelectorProps {
  provider: 'openai' | 'anthropic'
  model: string
  onProviderChange: (provider: 'openai' | 'anthropic') => void
  onModelChange: (model: string) => void
}

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    icon: Zap,
    models: [
      { id: 'gpt-4', name: 'GPT-4', description: 'Most capable model' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Faster and cheaper' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient' },
    ]
  },
  anthropic: {
    name: 'Anthropic',
    icon: Brain,
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Latest and most capable' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fast and efficient' },
    ]
  }
} as const

export function ProviderSelector({ provider, model, onProviderChange, onModelChange }: ProviderSelectorProps) {
  const [open, setOpen] = useState(false)
  const currentProvider = PROVIDERS[provider]
  const currentModel = currentProvider.models.find(m => m.id === model) || currentProvider.models[0]
  const Icon = currentProvider.icon

  const handleProviderModelChange = (newProvider: 'openai' | 'anthropic', newModel: string) => {
    onProviderChange(newProvider)
    onModelChange(newModel)
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[220px] justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" />
            <span className="truncate">{currentProvider.name}</span>
            <Badge variant="secondary" className="text-xs">
              {currentModel.name}
            </Badge>
          </div>
          <ChevronDown className="w-4 h-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="min-w-[280px]">
        {Object.entries(PROVIDERS).map(([providerId, providerInfo]) => (
          <div key={providerId}>
            <div className="px-3 py-2 text-sm font-medium text-muted-foreground bg-muted/50">
              <div className="flex items-center gap-2">
                <providerInfo.icon className="w-4 h-4" />
                {providerInfo.name}
              </div>
            </div>
            
            {providerInfo.models.map((modelOption) => (
              <DropdownMenuItem
                key={modelOption.id}
                onClick={() => handleProviderModelChange(providerId as 'openai' | 'anthropic', modelOption.id)}
                className="flex items-start gap-3 p-3 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{modelOption.name}</span>
                    {provider === providerId && model === modelOption.id && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {modelOption.description}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
            
            {providerId !== 'anthropic' && <DropdownMenuSeparator />}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}