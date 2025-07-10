'use client'

import { useState } from 'react'
import { Agent, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol'
import { agentAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  X,
  Plus,
  Bot,
  Sparkles,
  Code,
  Palette,
  BarChart3,
  Headphones,
  Tag,
  Settings,
  Info,
  Globe,
  Lock,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentFormProps {
  agent?: Agent
  onSave: (agent: Agent) => void
  onCancel: () => void
}

export function AgentForm({ agent, onSave, onCancel }: AgentFormProps) {
  const [formData, setFormData] = useState<CreateAgentRequest>({
    name: agent?.name || '',
    description: agent?.description || '',
    category: agent?.category || 'general',
    systemPrompt: agent?.systemPrompt || '',
    model: agent?.model || 'gpt-4',
    tags: agent?.tags || [],
    isPublic: agent?.isPublic || false,
    temperature: agent?.temperature,
    maxTokens: agent?.maxTokens,
    customInstructions: agent?.customInstructions || '',
    allowedStarshipClasses: agent?.allowedStarshipClasses || ['scout', 'cruiser'],
  })

  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let savedAgent: Agent
      if (agent) {
        savedAgent = await agentAPI.update(agent.id, formData as UpdateAgentRequest)
      } else {
        // Create data - authorId will be set by server from auth context
        const createData: CreateAgentRequest = {
          ...formData,
          tags: formData.tags || [],
          isPublic: formData.isPublic || false,
        }
        savedAgent = await agentAPI.create(createData)
      }
      onSave(savedAgent)
    } catch (error) {
      console.error('Failed to save agent:', error)
    } finally {
      setLoading(false)
    }
  }

  const addTag = () => {
    if (newTag.trim() && !formData.tags!.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), newTag.trim()],
      }))
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(tag => tag !== tagToRemove),
    }))
  }

  // Category icons mapping
  const categoryIcons = {
    general: Sparkles,
    coding: Code,
    creative: Palette,
    analysis: BarChart3,
    support: Headphones,
  }

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Header with icon */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">{agent ? 'Edit Agent' : 'Create New Agent'}</h2>
        </div>

        <div className="space-y-8">
          {/* Basic Information Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-md font-medium">Basic Information</h3>
              <Separator className="flex-1" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  Name
                </label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Agent name"
                  className="border-muted-foreground/20 focus:border-primary"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Choose a descriptive name for your agent
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  Category
                </label>
                <Select
                  value={formData.category}
                  onValueChange={value =>
                    setFormData(prev => ({ ...prev, category: value as Agent['category'] }))
                  }
                >
                  <SelectTrigger className="border-muted-foreground/20 focus:border-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryIcons).map(([category, Icon]) => (
                      <SelectItem key={category} value={category}>
                        <div className="flex items-center gap-2">
                          <Icon
                            className={cn(
                              'h-4 w-4',
                              category === 'general' && 'text-blue-500',
                              category === 'coding' && 'text-green-500',
                              category === 'creative' && 'text-purple-500',
                              category === 'analysis' && 'text-orange-500',
                              category === 'support' && 'text-pink-500'
                            )}
                          />
                          <span className="capitalize">{category}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select the category that best describes your agent's purpose
                </p>
              </div>
            </div>
          </div>

          {/* Description & Behavior Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-md font-medium">Description & Behavior</h3>
              <Separator className="flex-1" />
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  Description
                </label>
                <Textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of what this agent does"
                  className="border-muted-foreground/20 focus:border-primary min-h-[80px]"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Provide a clear, concise description of your agent's capabilities
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  System Prompt
                </label>
                <Textarea
                  value={formData.systemPrompt}
                  onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder="Instructions that define the agent's behavior and personality"
                  className="border-muted-foreground/20 focus:border-primary min-h-[120px]"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Define how your agent should behave, what knowledge it should have, and any
                  constraints it should follow
                </p>
              </div>
            </div>
          </div>

          {/* Tags Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-md font-medium">Tags & Visibility</h3>
              <Separator className="flex-1" />
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[40px] p-2 border rounded-md border-muted-foreground/20 bg-background">
                  {(formData.tags || []).length === 0 ? (
                    <span className="text-sm text-muted-foreground italic">No tags added yet</span>
                  ) : (
                    (formData.tags || []).map(tag => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="flex items-center gap-1 px-2 py-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-1 hover:bg-muted rounded-full"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    placeholder="Add tag"
                    className="border-muted-foreground/20 focus:border-primary"
                    onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  />
                  <Button type="button" onClick={addTag} size="sm" className="px-3">
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add relevant tags to help others discover your agent
                </p>
              </div>

              {/* Public/Private Toggle */}
              <div className="flex items-center justify-between p-4 border rounded-md border-muted-foreground/20 bg-muted/5">
                <div className="flex items-start gap-3">
                  {formData.isPublic ? (
                    <Globe className="h-5 w-5 text-primary mt-0.5" />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  )}
                  <div>
                    <label className="text-sm font-medium">Make Public</label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Allow other users to discover and use this agent
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.isPublic}
                  onCheckedChange={checked => setFormData(prev => ({ ...prev, isPublic: checked }))}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm"
            >
              <Settings className="h-4 w-4" />
              {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
            </Button>

            {showAdvanced && (
              <div className="mt-4 space-y-6 p-4 border rounded-lg border-muted-foreground/20 bg-muted/5">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-md font-medium">Advanced Configuration</h3>
                  <Separator className="flex-1" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Temperature
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={formData.temperature || ''}
                      onChange={e =>
                        setFormData(prev => ({
                          ...prev,
                          temperature: e.target.value ? parseFloat(e.target.value) : undefined,
                        }))
                      }
                      placeholder="0.7"
                      className="border-muted-foreground/20 focus:border-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                      Controls randomness: lower values are more deterministic, higher values more
                      creative (0-2)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Max Tokens
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="8192"
                      value={formData.maxTokens || ''}
                      onChange={e =>
                        setFormData(prev => ({
                          ...prev,
                          maxTokens: e.target.value ? parseInt(e.target.value) : undefined,
                        }))
                      }
                      placeholder="4096"
                      className="border-muted-foreground/20 focus:border-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum length of the response (1-8192)
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    Custom Instructions
                  </label>
                  <Textarea
                    value={formData.customInstructions}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, customInstructions: e.target.value }))
                    }
                    placeholder="Additional instructions or constraints"
                    className="border-muted-foreground/20 focus:border-primary min-h-[100px]"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Add any additional instructions that should be applied to every interaction
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} className="px-6">
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="px-6 bg-primary hover:bg-primary/90">
            {loading ? 'Saving...' : agent ? 'Update Agent' : 'Create Agent'}
          </Button>
        </div>
      </form>
    </div>
  )
}
