'use client'

import { motion, AnimatePresence } from 'motion/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Bot, Zap, Sparkles } from 'lucide-react'
import { providerSwitchVariants, buttonVariants } from '@/lib/animations'

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
      className="flex items-center gap-4"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* Provider Selection */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Provider:</span>
        <div className="flex gap-2">
          {Object.entries(PROVIDER_INFO).map(([key, info]) => (
            <motion.button
              key={key}
              className={`
                relative px-4 py-2 rounded-lg border transition-all duration-200
                ${provider === key 
                  ? 'sibil-glass border-white/20 text-white shadow-lg' 
                  : 'border-border/50 text-muted-foreground hover:border-border'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              variants={providerSwitchVariants}
              initial="inactive"
              animate={provider === key ? "active" : "inactive"}
              whileHover={!disabled ? "hover" : undefined}
              whileTap={!disabled ? { scale: 0.98 } : undefined}
              onClick={() => !disabled && onProviderChange(key as 'openai' | 'anthropic')}
              disabled={disabled}
            >
              {/* Background gradient for active state */}
              <AnimatePresence>
                {provider === key && (
                  <motion.div
                    className="absolute inset-0 rounded-lg opacity-20"
                    style={{ background: info.gradient }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 0.2, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
              </AnimatePresence>
              
              <div className="relative flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: info.color }}
                />
                <span className="font-medium text-sm">{info.name}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Model Selection */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Model:</span>
        <motion.div
          className="relative"
          whileHover={{ scale: disabled ? 1 : 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div className="relative">
            <Select value={currentModel} onValueChange={onModelChange} disabled={disabled}>
              <SelectTrigger className="w-56 sibil-glass border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-2 w-full">
                  {selectedModelInfo.icon}
                  <span className="font-medium">{selectedModelInfo.name}</span>
                  <Badge
                    variant="secondary"
                    className="ml-auto text-xs sibil-provider-badge"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${PROVIDER_INFO[provider].color} 10%, transparent)`,
                      borderColor: `color-mix(in srgb, ${PROVIDER_INFO[provider].color} 20%, transparent)`,
                      color: PROVIDER_INFO[provider].color
                    }}
                  >
                    {selectedModelInfo.badge}
                  </Badge>
                </div>
              </SelectTrigger>
              <SelectContent>
                <AnimatePresence>
                  {currentModels.map((modelOption, index) => (
                    <motion.div
                      key={modelOption.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <SelectItem value={modelOption.id}>
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex items-center gap-2">
                            {modelOption.icon}
                            <div>
                              <div className="font-medium">{modelOption.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {modelOption.description}
                              </div>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="ml-auto text-xs"
                            style={{
                              borderColor: `color-mix(in srgb, ${PROVIDER_INFO[provider].color} 30%, transparent)`,
                              color: PROVIDER_INFO[provider].color
                            }}
                          >
                            {modelOption.badge}
                          </Badge>
                        </div>
                      </SelectItem>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      </div>

      {/* Provider Info Tooltip */}
      <motion.div
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full sibil-glass border-white/10"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div 
          className="w-1.5 h-1.5 rounded-full sibil-animate-pulse-slow"
          style={{ backgroundColor: PROVIDER_INFO[provider].color }}
        />
        <span className="text-xs text-muted-foreground">
          {PROVIDER_INFO[provider].description}
        </span>
      </motion.div>
    </motion.div>
  )
}