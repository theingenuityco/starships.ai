'use client'

import React from 'react'
import { useParams } from 'next/navigation'

import { ViewEditorShell } from '@/components/view-editor'
import { useView } from '@/hooks/useViews'

export default function ViewEditorPage() {
  const { slug: slugParam, viewId: viewIdParam } = useParams<{ slug: string; viewId: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const viewId = typeof viewIdParam === 'string' ? viewIdParam : ''

  const viewQuery = useView(viewId, Boolean(viewId))
  const view = viewQuery.data

  return (
    <div className="h-full min-h-0 overflow-hidden">
      {viewQuery.isLoading ? (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : !view ? (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground">View not found.</p>
        </div>
      ) : (
        <ViewEditorShell slug={slug} viewId={viewId} view={view} />
      )}
    </div>
  )
}

