'use client'

import api from '@/lib/api'
import type {
  AdminConnectorTemplateDeleteResponse,
  AdminConnectorTemplateListResponse,
  AdminConnectorTemplateResponse,
  AdminConnectorTemplateActionsListResponse,
  AdminConnectorTemplateActionResponse,
  ApiResponse,
  BulkReplaceConnectorTemplateActionsRequest,
  CreateConnectorTemplateRequest,
  ConnectorTemplateAdminModel,
  ConnectorTemplateModel,
  ConnectorEndpointV2,
  UpsertConnectorTemplateActionRequest,
  UpdateConnectorTemplateRequest,
} from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

export const ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS = {
  all: ['admin', 'connector-templates'] as const,
  list: () => [...ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all, 'list'] as const,
  detail: (id: string) => [...ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all, 'detail', id] as const,
  legacyEndpoints: (id: string) => [...ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all, 'legacy-endpoints', id] as const,
  actions: (id: string, params?: { q?: string; limit?: number; offset?: number }) =>
    [...ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all, 'actions', id, params?.q ?? '', params?.limit ?? 50, params?.offset ?? 0] as const,
  action: (id: string, actionName: string) => [...ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all, 'action', id, actionName] as const,
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

export function useAdminConnectorTemplateLegacyEndpoints(id: string | null | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: id ? ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.legacyEndpoints(id) : ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.legacyEndpoints('missing'),
    enabled: enabled && !!id,
    queryFn: async (): Promise<unknown[]> => {
      const response: FetchResponse<ApiResponse<{ LEGACY_endpoints: unknown[] }>> = await api.get(`/api/v1/admin/connector-templates/${id}/legacy-endpoints`)
      const raw = response.data.data?.LEGACY_endpoints
      return Array.isArray(raw) ? raw : []
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

export function useAdminConnectorTemplateActions(id: string | null | undefined, params?: { q?: string; limit?: number; offset?: number }, enabled: boolean = true) {
  const q = params?.q
  const limit = params?.limit
  const offset = params?.offset
  return useQuery({
    queryKey: id ? ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.actions(id, { q, limit, offset }) : ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.actions('missing'),
    enabled: enabled && !!id,
    queryFn: async (): Promise<AdminConnectorTemplateActionsListResponse> => {
      const search = new URLSearchParams()
      if (q) search.set('q', q)
      if (typeof limit === 'number') search.set('limit', String(limit))
      if (typeof offset === 'number') search.set('offset', String(offset))
      const qs = search.toString()
      const response: FetchResponse<ApiResponse<AdminConnectorTemplateActionsListResponse>> = await api.get(`/api/v1/admin/connector-templates/${id}/actions${qs ? `?${qs}` : ''}`)
      return response.data.data
    },
    staleTime: 5 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useAdminConnectorTemplateAction(id: string | null | undefined, actionName: string | null | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: id && actionName ? ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.action(id, actionName) : ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.action(id || 'missing', actionName || 'missing'),
    enabled: enabled && !!id && !!actionName,
    queryFn: async (): Promise<ConnectorEndpointV2> => {
      const response: FetchResponse<ApiResponse<AdminConnectorTemplateActionResponse>> = await api.get(`/api/v1/admin/connector-templates/${id}/actions/${encodeURIComponent(String(actionName))}`)
      return response.data.data.action
    },
    staleTime: 5 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useUpsertAdminConnectorTemplateAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: string; actionName: string; payload: UpsertConnectorTemplateActionRequest }) => {
      await api.put(`/api/v1/admin/connector-templates/${args.id}/actions/${encodeURIComponent(args.actionName)}`, args.payload)
      return true
    },
    onSuccess: (_ok, vars) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.actions(vars.id) })
      queryClient.invalidateQueries({ queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.action(vars.id, vars.actionName) })
      toast.success('Action saved', { description: vars.actionName })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to save action'
      toast.error('Failed to save action', { description: message })
    },
  })
}

export function useDeleteAdminConnectorTemplateAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: string; actionName: string }) => {
      await api.delete(`/api/v1/admin/connector-templates/${args.id}/actions/${encodeURIComponent(args.actionName)}`)
      return true
    },
    onSuccess: (_ok, vars) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.actions(vars.id) })
      toast.success('Action deleted', { description: vars.actionName })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to delete action'
      toast.error('Failed to delete action', { description: message })
    },
  })
}

export function useBulkReplaceAdminConnectorTemplateActions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: string; payload: BulkReplaceConnectorTemplateActionsRequest }) => {
      await api.put(`/api/v1/admin/connector-templates/${args.id}/actions`, args.payload)
      return true
    },
    onSuccess: (_ok, vars) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.actions(vars.id) })
      toast.success('Actions replaced')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to replace actions'
      toast.error('Failed to replace actions', { description: message })
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
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CONNECTOR_TEMPLATES_QUERY_KEYS.all })
      const descriptionParts = [variables.provider || variables.name || variables.id]
      if (result?.deletedConnectors) {
        const count = result.deletedConnectors
        const label = count === 1 ? 'connector' : 'connectors'
        descriptionParts.push(`${count} ${label} removed`)
      }
      toast.success('Connector template deleted', { description: descriptionParts.filter(Boolean).join(' • ') })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to delete connector template'
      toast.error('Failed to delete connector template', { description: message })
    },
  })
}
