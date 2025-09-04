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
  compact?: boolean
}

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    icon: Zap,
    models: [
      { id: 'gpt-4', name: 'GPT-4', description: 'Most capable model' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Faster and cheaper' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient' },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    icon: Brain,
    models: [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Latest and most capable',
      },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fast and efficient' },
    ],
  },
} as const

export function ProviderSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  compact = false,
}: ProviderSelectorProps) {
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
        <Button
          variant="outline"
          className={cn(
            'gap-2 justify-between',
            compact ? 'h-8 px-3 text-xs min-w-[160px]' : 'min-w-[220px]'
          )}
        >
          <div className="flex items-center gap-2">
            <Icon className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
            <span className="truncate">
              {compact ? currentProvider.name.slice(0, 8) : currentProvider.name}
            </span>
            <Badge
              variant="secondary"
              className={cn(compact ? 'text-[10px] px-1 py-0 h-4' : 'text-xs')}
            >
              {compact ? currentModel.name.slice(0, 10) : currentModel.name}
            </Badge>
          </div>
          <ChevronDown className={cn(compact ? 'w-3 h-3' : 'w-4 h-4', 'opacity-50')} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className={cn(compact ? 'min-w-[250px]' : 'min-w-[280px]')}>
        {Object.entries(PROVIDERS).map(([providerId, providerInfo]) => (
          <div key={providerId}>
            <div
              className={cn(
                'px-3 py-2 text-sm font-medium text-muted-foreground bg-muted/50',
                compact && 'py-1'
              )}
            >
              <div className="flex items-center gap-2">
                <providerInfo.icon className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
                {providerInfo.name}
              </div>
            </div>

            {providerInfo.models.map(modelOption => (
              <DropdownMenuItem
                key={modelOption.id}
                onClick={() =>
                  handleProviderModelChange(providerId as 'openai' | 'anthropic', modelOption.id)
                }
                className={cn('flex items-start gap-3 cursor-pointer', compact ? 'p-2' : 'p-3')}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('font-medium', compact && 'text-sm')}>
                      {modelOption.name}
                    </span>
                    {provider === providerId && model === modelOption.id && (
                      <Check className={cn(compact ? 'w-3 h-3' : 'w-4 h-4', 'text-primary')} />
                    )}
                  </div>
                  <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
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
