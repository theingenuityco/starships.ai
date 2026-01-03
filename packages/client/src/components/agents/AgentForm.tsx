'use client'

import Icon from '@/components/primitives/Icon'

import { useState } from 'react'
import { AgentModel, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol'
import { agentAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

interface AgentFormProps {
  agent?: AgentModel
  onSave: (agent: AgentModel) => void
  onCancel: () => void
  starshipId?: string
}

export function AgentForm({ agent, onSave, onCancel, starshipId }: AgentFormProps) {
  type AgentFormData = Omit<CreateAgentRequest, 'starshipId'>

  const [formData, setFormData] = useState<AgentFormData>({
    name: agent?.name || '',
    role: agent?.role || 'Assistant',
    description: agent?.description || '',
    model: agent?.model || 'gpt-4',
    temperature: agent?.temperature,
    maxTokens: agent?.maxTokens,
    systemPrompt: agent?.systemPrompt || '',
    previewPrompts: Array.isArray(agent?.previewPrompts) ? agent?.previewPrompts : [],
    state: agent?.state || {
      messages: [],
      tools: [],
    },
    blueprint: agent?.blueprint || {
      nodes: [],
      edges: [],
    },
  })

  // Legacy UI state (not part of protocol)
  const [tags, setTags] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({})

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {}

    if (!formData.name.trim()) {
      errors.name = 'Agent name is required'
    }

    if (!formData.role || !String(formData.role).trim()) {
      errors.role = 'Role is required'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      let savedAgent: AgentModel
      if (agent) {
        savedAgent = await agentAPI.update(agent.id, formData as UpdateAgentRequest)
      } else {
        // Create data - authorId will be set by server from auth context
        const createData: CreateAgentRequest = {
          ...formData,
          // Starship context should be derived from the surrounding ship UI, not user input.
          // If not provided, the server will reject; we keep this out of the "form" itself.
          ...(starshipId ? { starshipId } : {}),
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
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  // Category icons mapping
  const categoryIcons = {
    general: 'sparkles',
    coding: 'code',
    creative: 'palette',
    analysis: 'bar-chart3',
    support: 'headphones',
  } as const

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Header with icon */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Icon name="bot" className="h-6 w-6 text-primary" />
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
                  <Icon name="bot" className="h-4 w-4 text-muted-foreground" />
                  Name
                </label>
                <Input
                  value={formData.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Agent name"
                  className="border-muted-foreground/20 focus:border-primary"
                  required
                />
                <p className="text-xs text-muted-foreground">Choose a descriptive name for your agent</p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Icon name="badge" className="h-4 w-4 text-muted-foreground" />
                  Role
                </label>
                <Input
                  value={formData.role || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  placeholder="e.g. Customer Support Agent"
                  className="border-muted-foreground/20 focus:border-primary"
                  required
                />
                <p className="text-xs text-muted-foreground">A short role label (shown in UI; used by templates and tooling)</p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Icon name="tag" className="h-4 w-4 text-muted-foreground" />
                  Category
                </label>
                <div className="text-sm text-muted-foreground p-2 border rounded border-muted-foreground/20 bg-muted/5">Category inferred from agent name</div>
                <p className="text-xs text-muted-foreground">Select the category that best describes your agent&apos;s purpose</p>
              </div>
            </div>

            <div className="mt-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Icon name="rocket" className="h-4 w-4 text-muted-foreground" />
                  Starship Assignment
                </label>
                <div className="text-sm text-muted-foreground p-2 border rounded border-muted-foreground/20 bg-muted/5">Starship assignment managed separately</div>
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
                  <Icon name="info" className="h-4 w-4 text-muted-foreground" />
                  Description
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of what this agent does"
                  className="border-muted-foreground/20 focus:border-primary min-h-[80px]"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">Provide a clear, concise description of your agent&apos;s capabilities</p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Icon name="message-square" className="h-4 w-4 text-muted-foreground" />
                  System Prompt
                </label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSystemPrompt(e.target.value)}
                  placeholder="Instructions that define the agent's behavior and personality"
                  className="border-muted-foreground/20 focus:border-primary min-h-[120px]"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">Define how your agent should behave, what knowledge it should have, and any constraints it should follow</p>
              </div>

              {/* Preview Prompts */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Icon name="list" className="h-4 w-4 text-muted-foreground" />
                  Preview Prompts
                </label>
                <Textarea
                  value={(formData.previewPrompts || []).join('\n')}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                    const lines = e.target.value
                      .split('\n')
                      .map(s => s.trim())
                      .filter(Boolean)
                      .slice(0, 10)
                    setFormData(prev => ({ ...prev, previewPrompts: lines }))
                  }}
                  placeholder={'One prompt per line (max 10).\nExample: Create a customer support agent that can help users with common questions'}
                  className="border-muted-foreground/20 focus:border-primary min-h-[120px] font-mono text-sm"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">These appear as example prompts in the chat input when this agent is mentioned. Recommended 3–5 concise prompts, max 10.</p>
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
                  <Icon name="tag" className="h-4 w-4 text-muted-foreground" />
                  Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[40px] p-2 border rounded-md border-muted-foreground/20 bg-background">
                  {tags.length === 0 ? (
                    <span className="text-sm text-muted-foreground italic">No tags added yet</span>
                  ) : (
                    tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="flex items-center gap-1 px-2 py-1">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:bg-muted rounded-full">
                          <Icon name="x" className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTag(e.target.value)}
                    placeholder="Add tag"
                    className="border-muted-foreground/20 focus:border-primary"
                    onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  />
                  <Button type="button" onClick={addTag} size="sm" className="px-3">
                    <Icon name="plus" className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Add relevant tags to help others discover your agent</p>
              </div>

              {/* Public/Private Toggle and Template Conversion */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 border rounded-md border-muted-foreground/20 bg-muted/5">
                  <div className="flex items-start gap-3">
                    {isPublic ? <Icon name="globe" className="h-5 w-5 text-primary mt-0.5" /> : <Icon name="lock" className="h-5 w-5 text-muted-foreground mt-0.5" />}
                    <div>
                      <label className="text-sm font-medium">Make Public</label>
                      <p className="text-xs text-muted-foreground mt-1">Allow other users to discover and use this agent</p>
                    </div>
                  </div>
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} className="data-[state=checked]:bg-primary" />
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div>
            <Button type="button" variant="ghost" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-sm">
              <Icon name="settings" className="h-4 w-4" />
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
                      <Icon name="settings" className="h-4 w-4 text-muted-foreground" />
                      Temperature
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={formData.temperature || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setFormData(prev => ({
                          ...prev,
                          temperature: e.target.value ? parseFloat(e.target.value) : undefined,
                        }))
                      }
                      placeholder="0.7"
                      className="border-muted-foreground/20 focus:border-primary"
                    />
                    <p className="text-xs text-muted-foreground">Controls randomness: lower values are more deterministic, higher values more creative (0-2)</p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Icon name="settings" className="h-4 w-4 text-muted-foreground" />
                      Max Tokens
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="8192"
                      value={formData.maxTokens || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setFormData(prev => ({
                          ...prev,
                          maxTokens: e.target.value ? parseInt(e.target.value) : undefined,
                        }))
                      }
                      placeholder="4096"
                      className="border-muted-foreground/20 focus:border-primary"
                    />
                    <p className="text-xs text-muted-foreground">Maximum length of the response (1-8192)</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Icon name="settings" className="h-4 w-4 text-muted-foreground" />
                    Custom Instructions
                  </label>
                  <Textarea
                    value={customInstructions}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomInstructions(e.target.value)}
                    placeholder="Additional instructions or constraints"
                    className="border-muted-foreground/20 focus:border-primary min-h-[100px]"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Add any additional instructions that should be applied to every interaction</p>
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
