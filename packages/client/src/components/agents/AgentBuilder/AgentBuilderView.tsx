'use client'

import React, { forwardRef, useImperativeHandle } from 'react'

import type { AgentBuilderViewProps, AgentBuilderViewRef } from './types'
import { useAgentForm } from './hooks/useAgentForm'
import { Button } from '@/components/ui/button'
import { AgentDocumentEditor } from './components/AgentDocumentEditor'

export const AgentBuilderView = forwardRef<AgentBuilderViewRef, AgentBuilderViewProps>(({ onSave, onCancel, persistenceKey }, ref) => {
  const { formData, errors, handleFieldChange, handleSave, resetForm, updateField } = useAgentForm({ onSave, persistenceKey })

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    updateField,
    getFormData: () => formData,
    resetForm,
  }))

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl w-full mx-auto px-6 py-6 space-y-6">
          <AgentDocumentEditor
            value={formData}
            onChange={next => {
              // sync doc into form state
              ;(Object.keys(next) as Array<keyof typeof next>).forEach(key => {
                // reuse handleFieldChange for validation clearing
                handleFieldChange(key as keyof typeof formData, next[key])
              })
            }}
            onSave={handleSave}
            onCancel={onCancel}
          />
        </div>
      </div>
    </div>
  )
})

AgentBuilderView.displayName = 'AgentBuilderView'
