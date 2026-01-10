'use client'

import api from '@/lib/api'
import type {
  AdminConnectorTemplateDeleteResponse,
  AdminConnectorTemplateListResponse,
  AdminConnectorTemplateResponse,
  ApiResponse,
  CreateConnectorTemplateRequest,
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

export function useCreateAdminConnectorTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateConnectorTemplateRequest): Promise<ConnectorTemplateAdminModel> => {
      const response: FetchResponse<ApiResponse<AdminConnectorTemplateResponse>> = await api.post(`/api/v1/admin/connector-templates`, payload)
      return response.data.data.connector
    },
    onSuccess: connector => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all })
      toast.success('Connector template created', { description: connector.provider })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to create connector template'
      toast.error('Failed to create connector template', { description: message })
    },
  })
}

type DeleteConnectorTemplateVariables = {
  id: string
  provider?: string
  name?: string
}

export function useDeleteAdminConnectorTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: DeleteConnectorTemplateVariables): Promise<AdminConnectorTemplateDeleteResponse> => {
      const response: FetchResponse<ApiResponse<AdminConnectorTemplateDeleteResponse>> = await api.delete(`/api/v1/admin/connector-templates/${id}`)
      return response.data.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all })
      const description = variables.provider || variables.name || variables.id
      toast.success('Connector template deleted', { description })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to delete connector template'
      toast.error('Failed to delete connector template', { description: message })
    },
  })
}
