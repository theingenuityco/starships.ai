'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Rocket, X, Check, AlertCircle, Sparkles, 
  Target, Bot, Search, Zap, Star, CircleCheck, 
  Wand2, ArrowRight, Shield, Brain, Code, Palette,
  ChevronRight, Loader2
} from 'lucide-react'
import { expeditionAPI } from '@/lib/expeditionApi'
import type { CreateExpeditionRequest } from '@starships/protocol'

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface CreateExpeditionModalProps {
  open: boolean
  onClose: () => void
  onExpeditionCreated: (expeditionId: string) => void
  starshipId: string
  starshipSlug: string
  starshipName?: string
}

interface FormData {
  name: string
  mission: string
  selectedAgents: string[]
}

interface ValidationErrors {
  name?: string
  mission?: string
  agents?: string
}

interface Agent {
  id: string
  name: string
  category: string
  role?: string
  skills?: string[]
  tags?: string[]
  status: 'active' | 'busy' | 'offline'
  avatar?: string
  description?: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CreateExpeditionModal({
  open,
  onClose,
  onExpeditionCreated,
  starshipId,
  starshipSlug,
  starshipName,
}: CreateExpeditionModalProps) {
  // State Management
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [searchQuery, setSearchQuery] = useState('')
  
  // Available agents state
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)

  // Form data state
  const [formData, setFormData] = useState<FormData>({
    name: '',
    mission: '',
    selectedAgents: [],
  })

  // Validation
  const validateForm = useCallback((): boolean => {
    const errors: ValidationErrors = {}

    if (!formData.name.trim()) {
      errors.name = 'Expedition name is required'
    } else if (formData.name.length < 3) {
      errors.name = 'Name must be at least 3 characters'
    }

    if (!formData.mission.trim()) {
      errors.mission = 'Mission description is required'
    } else if (formData.mission.length < 10) {
      errors.mission = 'Mission must be at least 10 characters'
    }

    if (formData.selectedAgents.length === 0) {
      errors.agents = 'Select at least one agent for the expedition'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }, [formData])

  // Load available agents
  const loadAvailableAgents = useCallback(async () => {
    if (!starshipId) return

    setLoadingAgents(true)
    try {
      const { default: api } = await import('@/lib/api')
      const response = await api.get(`/api/starships/${starshipId}/agents`)

      if (response.data?.deployedAgents) {
        setAvailableAgents(response.data.deployedAgents)
      }
    } catch (error) {
      console.error('Failed to load available agents:', error)
      setAvailableAgents([])
    } finally {
      setLoadingAgents(false)
    }
  }, [starshipId])

  // Agent toggle handler
  const handleToggleAgent = useCallback((agentId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedAgents: prev.selectedAgents.includes(agentId)
        ? prev.selectedAgents.filter(id => id !== agentId)
        : [...prev.selectedAgents, agentId]
    }))
    
    // Clear agent validation error
    if (validationErrors.agents) {
      setValidationErrors(prev => ({ ...prev, agents: undefined }))
    }
  }, [validationErrors.agents])

  // Form submission
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const expeditionRequest: CreateExpeditionRequest = {
        starshipId,
        name: formData.name.trim(),
        mission: formData.mission.trim(),
        selectedAgents: formData.selectedAgents,
      }

      const response = await expeditionAPI.createExpedition(expeditionRequest)
      onExpeditionCreated(response.expedition.id)
      onClose()
    } catch (error: any) {
      console.error('Failed to create expedition:', error)
      setSubmitError(error?.message || 'Failed to create expedition')
    } finally {
      setIsSubmitting(false)
    }
  }, [validateForm, starshipId, formData, onExpeditionCreated, onClose])

  // Load agents when modal opens
  useEffect(() => {
    if (open) {
      loadAvailableAgents()
    } else {
      // Reset form when modal closes
      setFormData({ name: '', mission: '', selectedAgents: [] })
      setValidationErrors({})
      setSubmitError(null)
      setSearchQuery('')
    }
  }, [open, loadAvailableAgents])

  // Filter agents based on search
  const filteredAgents = availableAgents.filter(agent => {
    const query = searchQuery.toLowerCase()
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.category.toLowerCase().includes(query) ||
      agent.role?.toLowerCase().includes(query) ||
      agent.skills?.some(skill => skill.toLowerCase().includes(query))
    )
  })

  // Get category color and icon
  const getCategoryStyle = (category: string) => {
    const styles: Record<string, { color: string; icon: any }> = {
      research: { color: 'bg-blue-500', icon: Brain },
      engineering: { color: 'bg-purple-500', icon: Code },
      analysis: { color: 'bg-green-500', icon: Shield },
      creative: { color: 'bg-pink-500', icon: Palette },
      operations: { color: 'bg-orange-500', icon: Zap },
      default: { color: 'bg-gray-500', icon: Bot },
    }
    return styles[category.toLowerCase()] || styles.default
  }

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-3xl max-h-[85vh] p-0 flex flex-col bg-background/95 backdrop-blur-sm [&>button]:hidden">
            {/* Accessibility: Hidden dialog title for screen readers */}
            <DialogHeader className="sr-only">
              <DialogTitle>Launch New Expedition</DialogTitle>
            </DialogHeader>
            
            {/* Simplified Header */}
            <div className="flex-shrink-0 border-b bg-card/50">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-6 py-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Rocket className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Launch New Expedition</h2>
                      <p className="text-sm text-muted-foreground">Coordinate your AI agents on {starshipName || starshipSlug}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="p-6 space-y-6">
                {/* Mission Details Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Mission Details</h3>
                  
                  <div className="space-y-4">
                    {/* Name Field */}
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium">
                        Expedition Name
                      </Label>
                      <div className="relative">
                        <Input
                          id="name"
                          placeholder="e.g., Market Analysis Deep Dive"
                          value={formData.name}
                          onChange={(e) => {
                            setFormData({ ...formData, name: e.target.value })
                            if (validationErrors.name) {
                              setValidationErrors({ ...validationErrors, name: undefined })
                            }
                          }}
                          className="h-10 px-3 bg-background border-border/50 focus:border-primary/50 transition-colors"
                          maxLength={100}
                        />
                        <AnimatePresence>
                          {formData.name && !validationErrors.name && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0 }}
                              className="absolute right-4 top-1/2 -translate-y-1/2"
                            >
                              <CircleCheck className="h-5 w-5 text-green-500" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      {validationErrors.name && (
                        <motion.p 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="text-sm text-destructive flex items-center gap-2"
                        >
                          <AlertCircle className="h-4 w-4" />
                          {validationErrors.name}
                        </motion.p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formData.name.length}/100 characters
                      </p>
                    </div>

                    {/* Mission Field */}
                    <div className="space-y-2">
                      <Label htmlFor="mission" className="text-sm font-medium">
                        Mission Objectives
                      </Label>
                      <div className="relative">
                        <Textarea
                          id="mission"
                          placeholder="Describe what you want your AI agents to accomplish..."
                          value={formData.mission}
                          onChange={(e) => {
                            setFormData({ ...formData, mission: e.target.value })
                            if (validationErrors.mission) {
                              setValidationErrors({ ...validationErrors, mission: undefined })
                            }
                          }}
                          rows={3}
                          className="resize-none text-sm p-3 bg-background border-border/50 focus:border-primary/50 transition-colors"
                          maxLength={500}
                        />
                        <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
                          {formData.mission.length}/500
                        </div>
                      </div>
                      {validationErrors.mission && (
                        <motion.p 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="text-sm text-destructive flex items-center gap-2"
                        >
                          <AlertCircle className="h-4 w-4" />
                          {validationErrors.mission}
                        </motion.p>
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* Agent Selection Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Assign AI Agents</h3>
                    <div className="flex items-center gap-3">
                      {formData.selectedAgents.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {formData.selectedAgents.length} selected
                        </Badge>
                      )}
                      {availableAgents.length > 0 && (
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            if (formData.selectedAgents.length === availableAgents.length) {
                              setFormData({ ...formData, selectedAgents: [] })
                            } else {
                              setFormData({ ...formData, selectedAgents: availableAgents.map(a => a.id) })
                            }
                          }}
                        >
                          {formData.selectedAgents.length === availableAgents.length ? 'Deselect All' : 'Select All'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {validationErrors.agents && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4"
                    >
                      <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                        <p className="text-sm text-destructive">{validationErrors.agents}</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Search Bar */}
                  {availableAgents.length > 3 && (
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search agents by name, role, or skills..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-background/50 backdrop-blur-sm"
                      />
                    </div>
                  )}

                  <div className="min-h-[250px]">
                    {loadingAgents ? (
                      <div className="flex flex-col items-center justify-center h-64 space-y-4">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Loader2 className="h-8 w-8 text-primary" />
                        </motion.div>
                        <p className="text-muted-foreground">Loading available agents...</p>
                      </div>
                    ) : availableAgents.length === 0 ? (
                      <Card className="border-dashed">
                        <div className="flex flex-col items-center justify-center p-12 text-center">
                          <div className="relative">
                            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full" />
                            <Bot className="relative h-12 w-12 text-muted-foreground/50" />
                          </div>
                          <h4 className="text-base font-semibold mt-6 mb-2">No Agents Available</h4>
                          <p className="text-muted-foreground mb-6 max-w-sm">
                            Deploy agents to your starship first to assign them to expeditions
                          </p>
                          <Button variant="outline" size="sm" className="gap-2" asChild>
                            <a href={`/ship/${starshipSlug}/crew`}>
                              <ChevronRight className="h-4 w-4" />
                              Go to Crew Management
                            </a>
                          </Button>
                        </div>
                      </Card>
                    ) : (
                      <div className="grid gap-3">
                        {filteredAgents.map((agent, index) => {
                          const isSelected = formData.selectedAgents.includes(agent.id)
                          const categoryStyle = getCategoryStyle(agent.category)
                          const IconComponent = categoryStyle.icon

                          return (
                            <motion.div
                              key={agent.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.05 }}
                            >
                              <label
                                htmlFor={`agent-checkbox-${agent.id}`}
                                className="block"
                              >
                                <Card 
                                  className={`
                                    group relative cursor-pointer transition-all duration-200
                                    ${isSelected
                                      ? 'border-primary bg-primary/5'
                                      : 'hover:border-border'
                                    }
                                  `}
                                >
                                  <div className="flex items-center gap-4 p-4">
                                    {/* Checkbox */}
                                    <Checkbox
                                      id={`agent-checkbox-${agent.id}`}
                                      checked={isSelected}
                                      onCheckedChange={() => handleToggleAgent(agent.id)}
                                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                    />
                                  
                                  {/* Agent Avatar */}
                                  <div className="relative">
                                    <Avatar className="h-10 w-10 border-2 border-background">
                                      <AvatarImage src={agent.avatar} alt={agent.name} />
                                      <AvatarFallback className={`${categoryStyle.color} text-white`}>
                                        <IconComponent className="h-5 w-5" />
                                      </AvatarFallback>
                                    </Avatar>
                                    {agent.status === 'active' && (
                                      <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
                                    )}
                                  </div>

                                  {/* Agent Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold">{agent.name}</p>
                                      <Badge variant="outline" className="text-xs">
                                        {agent.category}
                                      </Badge>
                                    </div>
                                    {agent.role && (
                                      <p className="text-sm text-muted-foreground mt-0.5">{agent.role}</p>
                                    )}
                                    {agent.skills && agent.skills.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {agent.skills.slice(0, 4).map((skill, i) => (
                                          <Badge key={i} variant="secondary" className="text-xs">
                                            {skill}
                                          </Badge>
                                        ))}
                                        {agent.skills.length > 4 && (
                                          <Badge variant="secondary" className="text-xs">
                                            +{agent.skills.length - 4}
                                          </Badge>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Selection Indicator */}
                                  {isSelected && (
                                    <Check className="h-4 w-4 text-primary shrink-0" />
                                  )}
                                </div>
                              </Card>
                            </label>
                            </motion.div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Error Display */}
                <AnimatePresence>
                  {submitError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
                    >
                      <p className="text-sm text-destructive flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {submitError}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            </div>

            {/* Footer Actions */}
            <div className="flex-shrink-0 border-t bg-card/50">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {formData.selectedAgents.slice(0, 3).map((agentId) => {
                      const agent = availableAgents.find(a => a.id === agentId)
                      const categoryStyle = agent ? getCategoryStyle(agent.category) : { color: 'bg-gray-500' }
                      return (
                        <Avatar key={agentId} className="h-8 w-8 border-2 border-background">
                          <AvatarFallback className={`${categoryStyle.color} text-white text-xs`}>
                            {agent?.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )
                    })}
                    {formData.selectedAgents.length > 3 && (
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        +{formData.selectedAgents.length - 3}
                      </div>
                    )}
                  </div>
                  {formData.selectedAgents.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {formData.selectedAgents.length} agent{formData.selectedAgents.length !== 1 ? 's' : ''} ready
                    </p>
                  )}
                </div>
                
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || availableAgents.length === 0}
                    className="min-w-[140px]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Launching...
                      </>
                    ) : (
                      'Launch Expedition'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  )
}