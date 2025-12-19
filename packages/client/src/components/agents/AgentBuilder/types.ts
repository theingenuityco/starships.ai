import type { AgentTemplateCategory } from '@starships/protocol'

export interface AgentFormData {
  name: string
  slug: string
  description: string
  category: AgentTemplateCategory
  model: string
  temperature: number
  maxTokens: number
  /**
   * Reasoning effort level.
   * - none: do not send a reasoning config (or explicitly clear it on existing agents)
   * - low/medium/high: send `{ enabled: true, effort }` to the backend
   */
  reasoning: 'none' | 'low' | 'medium' | 'high'
  systemPrompt: string
  previewPrompts?: string[]
  assignedToolSlugs: string[] // Array of tool slugs
  blueprint: string // JSON string for the blueprint
  timeout: number
  icon: string
}

export interface AgentBuilderViewProps {
  onSave?: (data: AgentFormData) => void
  onCancel?: () => void
  starshipId?: string
  initialSlug?: string
  errorMessage?: string
}

export interface AgentBuilderViewRef {
  updateField: (field: keyof AgentFormData, value: string | boolean | number | string[]) => void
  getFormData: () => AgentFormData
  resetForm: () => void
}

export type FormErrors = Partial<Record<keyof AgentFormData, string>>
