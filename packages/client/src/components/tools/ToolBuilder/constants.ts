import type { ToolFormData } from './types'
import type { ToolTemplateCategory } from '@starships/protocol'

export const INITIAL_FORM_DATA: ToolFormData = {
  name: '',
  description: '',
  category: 'general',
  exampleUsage: '',
  requiresApiKey: false,
  parameters: JSON.stringify(
    {
      type: 'object',
      properties: {},
      required: [],
    },
    null,
    2
  ),
  blueprint: JSON.stringify(
    {
      nodes: [],
      edges: [],
    },
    null,
    2
  ),
}

export const CATEGORIES: ToolTemplateCategory[] = ['general', 'automation', 'data', 'communication', 'coding', 'creative', 'analysis', 'support', 'utility']
