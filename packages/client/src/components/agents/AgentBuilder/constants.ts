import type { AgentFormData } from './types'
import type { AgentTemplateCategory } from '@starships/protocol'

export const INITIAL_FORM_DATA: AgentFormData = {
  name: '',
  slug: '',
  description: '',
  category: 'general',
  // IMPORTANT: Do not preselect a default model in the UI.
  // Users must explicitly choose a model when creating a new agent.
  model: '',
  temperature: 0.7,
  maxTokens: 2048,
  reasoning: 'none',
  systemPrompt: '',
  previewPrompts: [],
  assignedToolSlugs: [],
  blueprint: JSON.stringify(
    {
      nodes: [],
      edges: [],
    },
    null,
    2
  ),
  timeout: 60000,
  icon: '🤖',
}

export const AGENT_CATEGORIES: AgentTemplateCategory[] = ['general', 'automation', 'data', 'communication', 'coding', 'creative', 'analysis', 'support', 'utility']

export const DEFAULT_MODELS = ['anthropic/claude-sonnet-4.5', 'anthropic/claude-opus-4', 'anthropic/claude-sonnet-3.5', 'openai/gpt-4o', 'openai/gpt-4-turbo', 'openai/o1-preview']

export const DEFAULT_ICONS = ['🤖', '🧠', '✨', '🚀', '🎯', '💡', '🔮', '🌟', '⚡', '🎨', '🔧', '📊', '💬', '🎭', '🦾', '🌍']
