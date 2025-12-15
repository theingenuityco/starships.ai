'use client'

import api from '@/lib/api'
import type {
  AdminConnectorTemplateListResponse,
  AdminConnectorTemplateResponse,
  ApiResponse,
  ConnectorTemplateAdminModel,
  ConnectorTemplateModel,
  UpdateConnectorTemplateRequest,
} from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

export const ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS = {
  all: ['admin', 'connector-templates'] as const,
  list: () => [...ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all, 'list'] as const,
  detail: (id: string) => [...ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all, 'detail', id] as const,
} as const

export function useAdminConnectorTemplates(enabled: boolean = true) {
  return useQuery({
    queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.list(),
    enabled,
    queryFn: async (): Promise<ConnectorTemplateModel[]> => {
      const response: FetchResponse<ApiResponse<AdminConnectorTemplateListResponse>> = await api.get('/api/v1/admin/connector-templates')
      return response.data.data.connectors
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useAdminConnectorTemplate(id: string | null | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: id ? ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.detail(id) : ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.detail('missing'),
    enabled: enabled && !!id,
    queryFn: async (): Promise<ConnectorTemplateAdminModel> => {
      const response: FetchResponse<ApiResponse<AdminConnectorTemplateResponse>> = await api.get(`/api/v1/admin/connector-templates/${id}`)
      return response.data.data.connector
    },
    staleTime: 10 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useUpdateAdminConnectorTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateConnectorTemplateRequest }): Promise<ConnectorTemplateAdminModel> => {
      const response: FetchResponse<ApiResponse<AdminConnectorTemplateResponse>> = await api.put(`/api/v1/admin/connector-templates/${id}`, updates)
      return response.data.data.connector
    },
    onSuccess: connector => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all })
      toast.success('Connector template updated', { description: connector.provider })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to update connector template'
      toast.error('Failed to update connector template', { description: message })
    },
  })
}
