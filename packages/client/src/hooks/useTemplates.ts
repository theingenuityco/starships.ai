import api from '@/lib/api'
import type { AgentTemplateModel, ToolTemplateModel, ApiResponse } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

// Template filters for search and filtering
export interface TemplateFilters {
  category?: string
  search?: string
}

// Centralized query keys following TanStack Query best practices
export const TEMPLATE_QUERY_KEYS = {
  agentTemplates: ['agent-templates'] as const,
  agentTemplatesList: (filters?: TemplateFilters) => [...TEMPLATE_QUERY_KEYS.agentTemplates, 'list', { filters }] as const,
  agentTemplate: (id: string) => [...TEMPLATE_QUERY_KEYS.agentTemplates, 'detail', id] as const,

  toolTemplates: ['tool-templates'] as const,
  toolTemplatesList: (filters?: TemplateFilters) => [...TEMPLATE_QUERY_KEYS.toolTemplates, 'list', { filters }] as const,
  toolTemplate: (id: string) => [...TEMPLATE_QUERY_KEYS.toolTemplates, 'detail', id] as const,
} as const

/**
 * Get all agent templates
 */
export function useAgentTemplates(filters?: TemplateFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: TEMPLATE_QUERY_KEYS.agentTemplatesList(filters),
    queryFn: async (): Promise<AgentTemplateModel[]> => {
      const response: FetchResponse<ApiResponse<AgentTemplateModel[]>> = await api.get('/api/v1/agent-templates', {
        params: filters,
      })
      return response.data.data
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Get agent template by ID
 */
export function useAgentTemplate(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: TEMPLATE_QUERY_KEYS.agentTemplate(id),
    queryFn: async (): Promise<AgentTemplateModel> => {
      const response: FetchResponse<ApiResponse<AgentTemplateModel>> = await api.get(`/api/v1/agent-templates/${id}`)
      return response.data.data
    },
    enabled: !!id && enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}

/**
 * Get all tool templates (placeholder - needs backend implementation)
 */
export function useToolTemplates(filters?: TemplateFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: TEMPLATE_QUERY_KEYS.toolTemplatesList(filters),
    queryFn: async (): Promise<ToolTemplateModel[]> => {
      // TODO: Implement tool templates endpoint in backend
      // For now, return empty array to prevent errors
      return []
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Get tool template by ID (placeholder - needs backend implementation)
 */
export function useToolTemplate(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: TEMPLATE_QUERY_KEYS.toolTemplate(id),
    queryFn: async (): Promise<ToolTemplateModel> => {
      // TODO: Implement tool template endpoint in backend
      throw new Error('Tool templates not yet implemented')
    },
    enabled: !!id && enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}

/**
 * Create agent from template
 */
export function useCreateAgentFromTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ templateId, starshipId }: { templateId: string; starshipId: string }) => {
      const response: FetchResponse<ApiResponse<any>> = await api.post(`/api/v1/agent-templates/${templateId}/agents`, {
        starshipId,
      })
      return response.data.data
    },
    onSuccess: (agent, variables) => {
      // Invalidate agent queries to refresh lists
      queryClient.invalidateQueries({
        queryKey: ['agents'],
      })

      // Update template usage count
      queryClient.invalidateQueries({
        queryKey: TEMPLATE_QUERY_KEYS.agentTemplate(variables.templateId),
      })

      toast.success('Agent deployed successfully!', {
        description: `${agent.name} has been created and deployed to your starship.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to deploy agent'
      toast.error('Failed to deploy agent', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Create tool from template (placeholder - needs backend implementation)
 */
export function useCreateToolFromTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ templateId, starshipId }: { templateId: string; starshipId: string }) => {
      // TODO: Implement tool creation endpoint in backend
      throw new Error('Tool creation from template not yet implemented')
    },
    onSuccess: (tool, variables) => {
      // Invalidate tool queries to refresh lists
      queryClient.invalidateQueries({
        queryKey: ['tools'],
      })

      toast.success('Tool installed successfully!', {
        description: `Tool has been installed to your starship.`,
      })
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to install tool'
      toast.error('Failed to install tool', {
        description: errorMessage,
      })
    },
  })
}

/**
 * Utility hook for template categories
 */
export function useTemplateCategories() {
  const agentCategories = [
    { value: 'general', label: 'General', description: 'All-purpose AI assistant' },
    { value: 'coding', label: 'Coding', description: 'Programming and development' },
    { value: 'creative', label: 'Creative', description: 'Content creation and artistic tasks' },
    { value: 'analysis', label: 'Analysis', description: 'Data analysis and insights' },
    { value: 'support', label: 'Support', description: 'Customer service and help' },
  ] as const

  const toolCategories = [
    { value: 'general', label: 'General', description: 'General-purpose tools' },
    { value: 'integration', label: 'Integration', description: 'Third-party service integrations' },
    { value: 'automation', label: 'Automation', description: 'Workflow automation tools' },
    { value: 'data', label: 'Data', description: 'Data processing and analysis' },
    { value: 'communication', label: 'Communication', description: 'Communication and messaging' },
  ] as const

  const getAgentCategoryInfo = (category: string) => {
    return agentCategories.find(cat => cat.value === category)
  }

  const getToolCategoryInfo = (category: string) => {
    return toolCategories.find(cat => cat.value === category)
  }

  return {
    agentCategories,
    toolCategories,
    getAgentCategoryInfo,
    getToolCategoryInfo,
  }
}
