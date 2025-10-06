import type { ToolTemplateCategory } from '@starships/protocol'

export interface Parameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required: boolean
  properties?: Parameter[] // For object type
  items?: Parameter // For array type - the schema for array items
  isExpanded?: boolean // UI state for collapsible nested parameters
}

export interface ToolFormData {
  name: string
  description: string
  category: ToolTemplateCategory
  exampleUsage: string
  requiresApiKey: boolean
  parameters: string // JSON string for the parameters schema
  blueprint: string // JSON string for the blueprint
}

export interface ToolBuilderViewProps {
  onSave?: (data: ToolFormData) => void
  onCancel?: () => void
  starshipId?: string
}

export interface ToolBuilderViewRef {
  updateField: (field: keyof ToolFormData, value: string | boolean) => void
  getFormData: () => ToolFormData
  resetForm: () => void
}

export type FormErrors = Partial<Record<keyof ToolFormData, string>>
