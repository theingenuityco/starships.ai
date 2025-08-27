'use client'

import { motion } from 'motion/react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Bot, Zap, Sparkles } from 'lucide-react'

interface ModernProviderSelectorProps {
  provider: 'openai' | 'anthropic'
  model?: string
  onProviderChange: (provider: 'openai' | 'anthropic') => void
  onModelChange: (model: string) => void
  disabled?: boolean
}

const MODELS = {
  openai: [
    { 
      id: 'gpt-4', 
      name: 'GPT-4', 
      description: 'Most capable model',
      icon: <Bot className="h-3 w-3" />,
      badge: 'Premium'
    },
    { 
      id: 'gpt-4-turbo', 
      name: 'GPT-4 Turbo', 
      description: 'Faster and cheaper',
      icon: <Zap className="h-3 w-3" />,
      badge: 'Fast'
    },
    { 
      id: 'gpt-3.5-turbo', 
      name: 'GPT-3.5 Turbo', 
      description: 'Fast and efficient',
      icon: <Zap className="h-3 w-3" />,
      badge: 'Efficient'
    },
  ],
  anthropic: [
    { 
      id: 'claude-3-opus-20240229', 
      name: 'Claude 3 Opus', 
      description: 'Most capable',
      icon: <Sparkles className="h-3 w-3" />,
      badge: 'Premium'
    },
    { 
      id: 'claude-3-sonnet-20240229', 
      name: 'Claude 3 Sonnet', 
      description: 'Balanced',
      icon: <Bot className="h-3 w-3" />,
      badge: 'Balanced'
    },
    { 
      id: 'claude-3-haiku-20240307', 
      name: 'Claude 3 Haiku', 
      description: 'Fast and light',
      icon: <Zap className="h-3 w-3" />,
      badge: 'Fast'
    },
  ],
}

const PROVIDER_INFO = {
  openai: {
    name: 'OpenAI',
    color: 'var(--sibil-openai)',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    description: 'Advanced reasoning and creativity'
  },
  anthropic: {
    name: 'Anthropic',
    color: 'var(--sibil-anthropic)',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    description: 'Constitutional AI and safety'
  }
}

export function ModernProviderSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled = false
}: ModernProviderSelectorProps) {
  const currentModels = MODELS[provider]
  const currentModel = model || currentModels[0].id
  const selectedModelInfo = currentModels.find(m => m.id === currentModel) || currentModels[0]

  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Select
        value={`${provider}:${currentModel}`}
        onValueChange={(value) => {
          const [newProvider, newModel] = value.split(':') as ['openai' | 'anthropic', string]
          if (newProvider !== provider) {
            onProviderChange(newProvider)
          }
          onModelChange(newModel)
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-auto min-w-[180px] h-9 sibil-glass border-white/10 backdrop-blur-md hover:border-white/20 transition-colors">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: PROVIDER_INFO[provider].color }}
            />
            {selectedModelInfo.icon}
            <span className="font-medium text-sm">{selectedModelInfo.name}</span>
            <Badge
              variant="secondary"
              className="text-xs font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, ${PROVIDER_INFO[provider].color} 15%, transparent)`,
                borderColor: `color-mix(in srgb, ${PROVIDER_INFO[provider].color} 25%, transparent)`,
                color: PROVIDER_INFO[provider].color
              }}
            >
              {selectedModelInfo.badge}
            </Badge>
          </div>
        </SelectTrigger>
        
        <SelectContent>
          {/* OpenAI Models */}
          {MODELS.openai.map((modelOption) => (
            <SelectItem
              key={`openai:${modelOption.id}`}
              value={`openai:${modelOption.id}`}
            >
              <div className="flex items-center gap-2 w-full">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PROVIDER_INFO.openai.color }}
                />
                {modelOption.icon}
                <div className="flex-1">
                  <div className="font-medium text-sm">{modelOption.name}</div>
                  <div className="text-xs text-muted-foreground">
                    OpenAI • {modelOption.description}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{
                    borderColor: `color-mix(in srgb, ${PROVIDER_INFO.openai.color} 30%, transparent)`,
                    color: PROVIDER_INFO.openai.color
                  }}
                >
                  {modelOption.badge}
                </Badge>
              </div>
            </SelectItem>
          ))}
          
          {/* Anthropic Models */}
          {MODELS.anthropic.map((modelOption) => (
            <SelectItem
              key={`anthropic:${modelOption.id}`}
              value={`anthropic:${modelOption.id}`}
            >
              <div className="flex items-center gap-2 w-full">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PROVIDER_INFO.anthropic.color }}
                />
                {modelOption.icon}
                <div className="flex-1">
                  <div className="font-medium text-sm">{modelOption.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Anthropic • {modelOption.description}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{
                    borderColor: `color-mix(in srgb, ${PROVIDER_INFO.anthropic.color} 30%, transparent)`,
                    color: PROVIDER_INFO.anthropic.color
                  }}
                >
                  {modelOption.badge}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </motion.div>
  )
}