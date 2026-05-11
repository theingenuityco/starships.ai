import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import api from '@/lib/api'
import { getSafeErrorMessage } from '@/lib/error-utils'
import type { ApiResponse } from '@starships/protocol'

export interface BundleMeta {
  name: string
  description?: string
  version?: string
  tags?: string[]
  kind?: 'room' | 'agent' | 'tool' | 'connector'
}

export interface BundleManifestEntity {
  kind: string
  fromSlug?: string
  file: string
}

export interface BundleManifest {
  schemaVersion: string
  kind: 'bundle'
  exportedAt: string
  entities: {
    agents?: BundleManifestEntity[]
    tools?: BundleManifestEntity[]
    rooms?: BundleManifestEntity[]
    views?: BundleManifestEntity[]
    datasets?: BundleManifestEntity[]
    taskBoards?: BundleManifestEntity[]
  }
}

export interface BundleSummary {
  id: string
  meta: BundleMeta
  manifest: BundleManifest
}

export function useBundleServiceBundles(starshipId: string) {
  return useQuery({
    queryKey: ['bundle-service', 'bundles', starshipId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<BundleSummary[]>>(`/api/v1/starships/${starshipId}/bundle-service/bundles`)
      return (res.data.data ?? []) as BundleSummary[]
    },
    enabled: Boolean(starshipId),
    staleTime: 30_000,
  })
}

export function useInstallBundleFromService(starshipId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (bundleId: string) => {
      const res = await api.post<ApiResponse<{ imported: Record<string, number>; warnings?: string[] }>>(
        `/api/v1/starships/${starshipId}/bundle-service/${encodeURIComponent(bundleId)}/install`,
        {}
      )
      return res.data.data
    },
    onSuccess: async (data) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['rooms'] }),
        qc.invalidateQueries({ queryKey: ['agents'] }),
        qc.invalidateQueries({ queryKey: ['tools'] }),
        qc.invalidateQueries({ queryKey: ['views'] }),
        qc.invalidateQueries({ queryKey: ['datasets'] }),
        qc.invalidateQueries({ queryKey: ['task-boards'] }),
      ])
      const imported = data?.imported ?? {}
      const parts = Object.entries(imported)
        .filter(([, n]) => Number(n) > 0)
        .map(([k, n]) => `${Number(n)} ${k}`)
      toast.success('Bundle installed', {
        description: parts.length > 0 ? parts.join(', ') + ' imported' : 'Done',
      })
    },
    onError: (error: unknown) => {
      toast.error('Install failed', { description: getSafeErrorMessage(error) })
    },
  })
}
