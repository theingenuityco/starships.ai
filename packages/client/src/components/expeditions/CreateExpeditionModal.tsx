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
  ChevronRight, Loader2, Database, Headphones, PenTool,
  Lightbulb, BarChart2, HeartPulse, Hash, Settings,
  Trophy, Eye, Workflow
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
  workflowType: 'traditional' | 'fourPhase'
  visionContext?: string
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
    workflowType: 'traditional',
    visionContext: '',
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
      // Handle different workflow types
      if (formData.workflowType === 'fourPhase') {
        // Create 4-phase expedition using new API endpoint
        const response = await fetch(`/api/starships/${starshipId}/expeditions/start-4phase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalMission: formData.mission.trim(),
            selectedAgents: formData.selectedAgents,
            visionContext: formData.visionContext?.trim(),
            expeditionName: formData.name.trim()
          })
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to create 4-phase expedition')
        }
        
        const data = await response.json()
        onExpeditionCreated(data.expeditionId)
      } else {
        // Traditional expedition creation
        const expeditionRequest: CreateExpeditionRequest = {
          starshipId,
          name: formData.name.trim(),
          mission: formData.mission.trim(),
          selectedAgents: formData.selectedAgents,
        }

        const response = await expeditionAPI.createExpedition(expeditionRequest)
        onExpeditionCreated(response.expedition.id)
      }
      
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
      setFormData({ name: '', mission: '', selectedAgents: [], workflowType: 'traditional', visionContext: '' })
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
      analysis: { color: 'bg-green-500', icon: BarChart2 },
      creative: { color: 'bg-pink-500', icon: Lightbulb },
      coding: { color: 'bg-violet-500', icon: Code },
      support: { color: 'bg-orange-500', icon: HeartPulse },
      operations: { color: 'bg-amber-500', icon: Zap },
      default: { color: 'bg-gray-500', icon: Bot },
    }
    return styles[category.toLowerCase()] || styles.default
  }

  // Get agent avatar icon based on name or category (matching Crew Console logic)
  const getAgentAvatarIcon = (agent: Agent) => {
    const name = agent.name.toLowerCase()
    const category = agent.category.toLowerCase()
    
    if (name.includes('support') || category === 'support') {
      return <Headphones className="h-6 w-6" />
    } else if (name.includes('data') || name.includes('analyst') || category === 'analysis') {
      return <Database className="h-6 w-6" />
    } else if (name.includes('creative') || category === 'creative') {
      return <PenTool className="h-6 w-6" />
    } else if (name.includes('code') || name.includes('coding') || category === 'coding') {
      return <Code className="h-6 w-6" />
    } else {
      return <Bot className="h-6 w-6" />
    }
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
            
            {/* Enhanced Header */}
            <div className="flex-shrink-0 border-b bg-gradient-to-r from-card via-card/95 to-primary/5">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-6 py-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/20 blur-sm" />
                      <div className="relative p-2.5 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl border border-primary/20">
                        <Rocket className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">Launch New Expedition</h2>
                      <p className="text-sm text-muted-foreground">Coordinate your AI agents on {starshipName || starshipSlug}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="hover:bg-muted rounded-full"
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
                  className="bg-card/50 backdrop-blur-sm rounded-lg p-6 border border-border/50"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Target className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-medium text-foreground">Mission Details</h3>
                  </div>
                  
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
                          className="h-10 px-3 pr-24 bg-background border-border/50 focus:border-primary/50 transition-colors"
                          maxLength={100}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{formData.name.length}/100</span>
                          <AnimatePresence>
                            {formData.name && !validationErrors.name && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                              >
                                <CircleCheck className="h-4 w-4 text-green-500" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
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

                {/* Workflow Type Selection */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="bg-card/50 backdrop-blur-sm rounded-lg p-6 border border-border/50"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Workflow className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-medium text-foreground">Workflow Type</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Traditional Workflow */}
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        formData.workflowType === 'traditional'
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setFormData(prev => ({ ...prev, workflowType: 'traditional' }))}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                          <Settings className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm mb-1">Traditional Workflow</h4>
                          <p className="text-xs text-muted-foreground mb-3">
                            Classic expedition with immediate agent coordination and execution
                          </p>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary" className="text-xs">Immediate Start</Badge>
                            <Badge variant="secondary" className="text-xs">Auto-execution</Badge>
                          </div>
                        </div>
                        {formData.workflowType === 'traditional' && (
                          <CheckCircle className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </motion.div>

                    {/* Four-Phase Workflow */}
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        formData.workflowType === 'fourPhase'
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setFormData(prev => ({ ...prev, workflowType: 'fourPhase' }))}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                          <Brain className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm mb-1 flex items-center gap-1">
                            4-Phase Workflow
                            <Badge variant="outline" className="text-xs bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0">
                              NEW
                            </Badge>
                          </h4>
                          <p className="text-xs text-muted-foreground mb-3">
                            Guided workflow with user control: Refine → Plan → Execute → Result
                          </p>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary" className="text-xs">User Control</Badge>
                            <Badge variant="secondary" className="text-xs">Step-by-step</Badge>
                          </div>
                        </div>
                        {formData.workflowType === 'fourPhase' && (
                          <CheckCircle className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </motion.div>
                  </div>

                  {/* Four-Phase Workflow Description */}
                  <AnimatePresence>
                    {formData.workflowType === 'fourPhase' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-4 p-4 bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200/50"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <Sparkles className="w-4 h-4 text-purple-600 mt-0.5" />
                          <div>
                            <h5 className="font-medium text-sm text-purple-800">4-Phase Guided Workflow</h5>
                            <p className="text-xs text-purple-700 mt-1">
                              Take full control over your expedition with our new structured approach
                            </p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                              <Brain className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-medium">Refine</span>
                            <span className="text-xs text-muted-foreground">Clarify mission</span>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                              <Target className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-medium">Plan</span>
                            <span className="text-xs text-muted-foreground">Review & approve</span>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                              <Zap className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-medium">Execute</span>
                            <span className="text-xs text-muted-foreground">Monitor progress</span>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                              <Trophy className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-medium">Result</span>
                            <span className="text-xs text-muted-foreground">Review output</span>
                          </div>
                        </div>

                        {/* Vision Context for 4-Phase */}
                        <div className="mt-4 space-y-2">
                          <Label htmlFor="visionContext" className="text-xs font-medium text-purple-800">
                            Vision & Context <span className="text-muted-foreground">(Optional)</span>
                          </Label>
                          <Textarea
                            id="visionContext"
                            value={formData.visionContext}
                            onChange={(e) => setFormData(prev => ({ ...prev, visionContext: e.target.value }))}
                            placeholder="Provide additional context or vision for this 4-phase expedition..."
                            rows={2}
                            className="resize-none text-sm bg-white/50 border-purple-200 focus:border-purple-400"
                            maxLength={200}
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Help the AI understand your broader goals and constraints</span>
                            <span>{formData.visionContext?.length || 0}/200</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Agent Selection Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-card/50 backdrop-blur-sm rounded-lg p-6 border border-border/50"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-medium text-foreground">Assign AI Agents</h3>
                    </div>
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
                      <div className="space-y-3">
                        {filteredAgents.map((agent, index) => {
                          const isSelected = formData.selectedAgents.includes(agent.id)
                          const categoryStyle = getCategoryStyle(agent.category)

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
                                    group relative cursor-pointer transition-all duration-200 overflow-hidden
                                    ${isSelected
                                      ? 'border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-lg'
                                      : 'hover:border-primary/50 hover:shadow-md bg-gradient-to-br from-card to-card/80'
                                    }
                                  `}
                                >
                                  {/* Selection glow effect */}
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 opacity-50" />
                                  )}
                                  
                                  <div className="relative p-5">
                                    <div className="flex items-start gap-4">
                                      {/* Enhanced Avatar Section */}
                                      <div className="relative shrink-0">
                                        <div className="relative">
                                          <Avatar className="h-12 w-12 border-2 border-background shadow-md">
                                            <AvatarImage src={agent.avatar} alt={agent.name} />
                                            <AvatarFallback className={`${categoryStyle.color} text-white font-semibold`}>
                                              {getAgentAvatarIcon(agent)}
                                            </AvatarFallback>
                                          </Avatar>
                                          {agent.status === 'active' && (
                                            <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                                          )}
                                        </div>
                                        {/* Checkbox below avatar */}
                                        <div className="flex justify-center mt-3">
                                          <Checkbox
                                            id={`agent-checkbox-${agent.id}`}
                                            checked={isSelected}
                                            onCheckedChange={() => handleToggleAgent(agent.id)}
                                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary h-5 w-5"
                                          />
                                        </div>
                                      </div>

                                      {/* Enhanced Agent Info */}
                                      <div className="flex-1 min-w-0 space-y-3">
                                        {/* Header */}
                                        <div>
                                          <div className="flex items-start justify-between gap-2">
                                            <div>
                                              <div className="flex items-center gap-2">
                                                <h4 className="font-semibold text-base">{agent.name}</h4>
                                                <Badge 
                                                  variant="outline" 
                                                  className={`text-xs ${
                                                    agent.category === 'research' ? 'border-blue-500/50 text-blue-600' :
                                                    agent.category === 'engineering' ? 'border-purple-500/50 text-purple-600' :
                                                    agent.category === 'analysis' ? 'border-green-500/50 text-green-600' :
                                                    agent.category === 'creative' ? 'border-pink-500/50 text-pink-600' :
                                                    'border-border'
                                                  }`}
                                                >
                                                  {agent.category}
                                                </Badge>
                                              </div>
                                              {agent.role && (
                                                <p className="text-sm text-muted-foreground mt-0.5">{agent.role}</p>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Description */}
                                        <p className="text-sm text-muted-foreground line-clamp-2">
                                          {agent.description || `A specialized ${agent.category} agent with expertise in ${agent.skills?.slice(0, 2).join(' and ') || 'various tasks'}.`}
                                        </p>

                                        {/* Skills */}
                                        {agent.skills && agent.skills.length > 0 && (
                                          <div className="space-y-2">
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                              <Sparkles className="h-3 w-3" />
                                              <span>Specializations</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                              {agent.skills.slice(0, 4).map((skill, i) => (
                                                <Badge 
                                                  key={i} 
                                                  variant="secondary" 
                                                  className="text-xs px-2 py-0.5 bg-secondary/50"
                                                >
                                                  {skill}
                                                </Badge>
                                              ))}
                                              {agent.skills.length > 4 && (
                                                <Badge 
                                                  variant="secondary" 
                                                  className="text-xs px-2 py-0.5 bg-secondary/50"
                                                >
                                                  +{agent.skills.length - 4} more
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* Tags */}
                                        {agent.tags && agent.tags.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5">
                                              {agent.tags.slice(0, 3).map((tag, i) => (
                                                <Badge 
                                                  key={i} 
                                                  variant="outline" 
                                                  className="text-xs px-2 py-0.5 border-primary/30 text-primary/80"
                                                >
                                                  {tag}
                                                </Badge>
                                              ))}
                                              {agent.tags.length > 3 && (
                                                <Badge 
                                                  variant="outline" 
                                                  className="text-xs px-2 py-0.5 border-primary/30 text-primary/80"
                                                >
                                                  +{agent.tags.length - 3} more
                                                </Badge>
                                              )}
                                          </div>
                                        )}

                                        {/* Selected indicator */}
                                        {isSelected && (
                                          <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="flex items-center gap-1 text-xs text-primary pt-2"
                                          >
                                            <Check className="h-3 w-3" />
                                            <span>Selected</span>
                                          </motion.div>
                                        )}
                                      </div>
                                    </div>
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
                          <AvatarImage src={agent?.avatar} alt={agent?.name} />
                          <AvatarFallback className={`${categoryStyle.color} text-white text-xs flex items-center justify-center`}>
                            {agent ? (
                              <div className="h-4 w-4">
                                {getAgentAvatarIcon(agent)}
                              </div>
                            ) : (
                              'A'
                            )}
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
                        {formData.workflowType === 'fourPhase' ? 'Starting 4-Phase...' : 'Launching...'}
                      </>
                    ) : (
                      formData.workflowType === 'fourPhase' ? 'Start 4-Phase Expedition' : 'Launch Expedition'
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