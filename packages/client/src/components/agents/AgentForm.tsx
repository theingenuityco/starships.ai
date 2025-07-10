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
import { X, Plus } from 'lucide-react'

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

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <Input
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Agent name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <Select
              value={formData.category}
              onValueChange={value =>
                setFormData(prev => ({ ...prev, category: value as Agent['category'] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="coding">Coding</SelectItem>
                <SelectItem value="creative">Creative</SelectItem>
                <SelectItem value="analysis">Analysis</SelectItem>
                <SelectItem value="support">Support</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <Textarea
            value={formData.description}
            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Brief description of what this agent does"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">System Prompt</label>
          <Textarea
            value={formData.systemPrompt}
            onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
            placeholder="Instructions that define the agent's behavior and personality"
            rows={4}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium mb-2">Tags</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(formData.tags || []).map(tag => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <button type="button" onClick={() => removeTag(tag)}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              placeholder="Add tag"
              onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
            />
            <Button type="button" onClick={addTag} size="sm">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Public/Private Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">Make Public</label>
            <p className="text-xs text-muted-foreground">
              Allow other users to discover and use this agent
            </p>
          </div>
          <Switch
            checked={formData.isPublic}
            onCheckedChange={checked => setFormData(prev => ({ ...prev, isPublic: checked }))}
          />
        </div>

        {/* Advanced Settings */}
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </Button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 border rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Temperature</label>
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
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Max Tokens</label>
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
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Custom Instructions</label>
                <Textarea
                  value={formData.customInstructions}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, customInstructions: e.target.value }))
                  }
                  placeholder="Additional instructions or constraints"
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : agent ? 'Update Agent' : 'Create Agent'}
          </Button>
        </div>
      </form>
    </div>
  )
}
