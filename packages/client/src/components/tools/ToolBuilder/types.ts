import type { ToolTemplateCategory } from '@starships/protocol'

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
