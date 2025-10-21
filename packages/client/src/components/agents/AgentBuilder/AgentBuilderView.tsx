'use client'

import React, { forwardRef, useImperativeHandle } from 'react'

import type { AgentBuilderViewProps, AgentBuilderViewRef } from './types'
import { useAgentForm } from './hooks/useAgentForm'
import { Button } from '@/components/ui/button'
import { AgentDocumentEditor } from './components/AgentDocumentEditor'

export const AgentBuilderView = forwardRef<AgentBuilderViewRef, AgentBuilderViewProps>(({ onSave, onCancel, starshipId, initialSlug }, ref) => {
  const { formData, errors, handleFieldChange, handleSave, resetForm, updateField } = useAgentForm({ onSave })

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    updateField: (field, value) => {
      try {
        console.debug('[AgentBuilderView] ref.updateField', { field, value })
      } catch {}
      updateField(field, value)
    },
    getFormData: () => {
      try {
        console.debug('[AgentBuilderView] ref.getFormData')
      } catch {}
      return formData
    },
    resetForm,
  }))

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl w-full mx-auto px-6 py-6 space-y-6">
          <AgentDocumentEditor
            value={formData}
            onChange={next => {
              ;(Object.keys(next) as Array<keyof typeof next>).forEach(key => {
                const value = next[key]
                if (value === undefined) return
                handleFieldChange(key as keyof typeof formData, value)
              })
            }}
            onFieldChange={(field, value) => handleFieldChange(field, value)}
            onSave={handleSave}
            onCancel={onCancel}
            starshipId={starshipId}
            // If editor mounts with empty slug, pre-seed from props
            key={`agent-editor-${initialSlug || 'none'}`}
          />
        </div>
      </div>
    </div>
  )
})

AgentBuilderView.displayName = 'AgentBuilderView'
