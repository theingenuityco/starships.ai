import type { AgentTemplateCategory } from '@starships/protocol'
import type { AgentModel } from '@starships/protocol'

export interface AgentFormData {
  name: string
  slug: string
  description: string
  /**
   * Category is optional in the backend and should not be defaulted in the UI.
   * We keep it as a controlled field by allowing the empty-string sentinel.
   */
  category: AgentTemplateCategory | ''
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
  /**
   * Optional: when editing an existing agent, pass its immutable id so the editor
   * can hydrate canonical agent details without doing a slug->id resolve fetch.
   */
  agentId?: string
  /**
   * Optional: if the parent already fetched the agent (e.g. via useAgent),
   * pass it down so the editor does not make its own /agents/:id call.
   */
  agent?: AgentModel | null
  initialSlug?: string
  errorMessage?: string
  /**
   * When true, renders the builder in read-only/inspection mode.
   */
  readOnly?: boolean
  /**
   * When true, renders the builder in an embedded mode suitable for the landing page:
   * hides ship-page-specific chrome and keeps layout compact.
   */
  embedded?: boolean
}

export interface AgentBuilderViewRef {
  updateField: (field: keyof AgentFormData, value: string | boolean | number | string[]) => void
  getFormData: () => AgentFormData
  resetForm: () => void
}

export type FormErrors = Partial<Record<keyof AgentFormData, string>>
