'use client'

import React, { forwardRef, useImperativeHandle } from 'react'

import type { AgentBuilderViewProps, AgentBuilderViewRef } from './types'
import { useAgentForm } from './hooks/useAgentForm'
import { Button } from '@/components/ui/button'
import { AgentDocumentEditor } from './components/AgentDocumentEditor'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

export const AgentBuilderView = forwardRef<AgentBuilderViewRef, AgentBuilderViewProps>(
  ({ onSave, onCancel, starshipId, agentId, agent, initialSlug, errorMessage, readOnly = false, embedded = false }, ref) => {
  const { formData, errors, handleFieldChange, handleSave, resetForm, updateField, setFormData } = useAgentForm({ onSave })

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    updateField: (field, value) => {
      updateField(field, value)
    },
    getFormData: () => {
      return formData
    },
    resetForm,
  }))

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1">
        <div className={embedded ? 'w-full max-w-none mx-0 px-3 py-3 space-y-6' : 'w-full max-w-6xl mx-auto px-6 py-3 space-y-6'}>
          {errorMessage ? (
            <Alert variant="destructive" className="flex-col">
              <AlertTitle>Agent creation failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <AgentDocumentEditor
            value={formData}
            onChange={next => {
              console.log('[AgentBuilder] onChange called with:', { 
                hasState: 'state' in next, 
                statePlugins: (next.state as { plugins?: unknown })?.plugins,
                allKeys: Object.keys(next)
              });
              // Handle state separately since it's a nested object
              if ('state' in next && next.state !== undefined) {
                setFormData(prev => ({ ...prev, state: next.state }))
              }
              // Handle other fields
              ;(Object.keys(next) as Array<keyof typeof next>).forEach(key => {
                if (key === 'state') return // Already handled above
                const value = next[key]
                if (value === undefined) return
                handleFieldChange(key as keyof typeof formData, value)
              })
            }}
            onFieldChange={(field, value) => handleFieldChange(field, value)}
            onSave={handleSave}
            onCancel={onCancel}
            starshipId={starshipId}
            agentId={agentId}
            agent={agent}
            readOnly={readOnly}
            embedded={embedded}
            // Keep the editor mounted across slug/url changes (renaming an agent updates slug).
            // Key by stable identity (agentId) so inputs don't lose focus.
            key={`agent-editor-${agentId || agent?.id || 'new'}`}
          />
        </div>
      </div>
    </div>
  )
  }
)

AgentBuilderView.displayName = 'AgentBuilderView'
