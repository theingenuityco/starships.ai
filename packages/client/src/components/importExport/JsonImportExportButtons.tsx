'use client'

import React, { useRef, useState } from 'react'
import api from '@/lib/api'
import type { ImportExportContainerV1, ApiResponse, StarshipImportResponse } from '@starships/protocol'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { FetchResponse } from '@/lib/types'

type Props = {
  kind: 'agent' | 'tool'
  starshipId: string
  exportResourceId?: string
  exportFileBaseName?: string
  onImported?: (result: StarshipImportResponse) => void
}

export function JsonImportExportButtons(props: Props): React.JSX.Element {
  const { kind, starshipId, exportResourceId, exportFileBaseName, onImported } = props
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const downloadJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleExport = async () => {
    if (!exportResourceId) return
    setIsExporting(true)
    try {
      const path = kind === 'agent' ? `/api/v1/agents/${exportResourceId}/export` : `/api/v1/tools/${exportResourceId}/export`
      const resp: FetchResponse<ApiResponse<ImportExportContainerV1>> = await api.get(path)
      const container = resp.data.data
      if (!container) throw new Error('Export failed: empty response')

      const base = exportFileBaseName || `${kind}-${exportResourceId}`
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      downloadJson(`${base}__${stamp}.json`, container)
      toast.success('Exported JSON')
    } catch (e: any) {
      toast.error('Export failed', { description: e?.message || 'Unknown error' })
    } finally {
      setIsExporting(false)
    }
  }

  const handlePickFile = () => {
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  const handleFileSelected = async (file: File | null) => {
    if (!file) return
    setIsImporting(true)
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('Invalid JSON file')
      }

      const resp: FetchResponse<ApiResponse<StarshipImportResponse>> = await api.post(`/api/v1/starships/${starshipId}/import`, parsed)
      const result = resp.data.data
      if (!result) throw new Error('Import failed: empty response')

      if (Array.isArray(result.warnings) && result.warnings.length > 0) {
        toast.success('Imported with warnings', { description: result.warnings.join('\n') })
      } else {
        toast.success('Imported')
      }
      onImported?.(result)
    } catch (e: any) {
      toast.error('Import failed', { description: e?.message || 'Unknown error' })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={e => void handleFileSelected(e.target.files?.[0] ?? null)} />

      <Button type="button" variant="outline" onClick={handlePickFile} disabled={!starshipId || isImporting}>
        {isImporting ? 'Importing…' : `Import ${kind === 'agent' ? 'Agent' : 'Tool'} JSON`}
      </Button>

      {exportResourceId && (
        <Button type="button" variant="outline" onClick={() => void handleExport()} disabled={isExporting}>
          {isExporting ? 'Exporting…' : 'Export JSON'}
        </Button>
      )}
    </div>
  )
}
