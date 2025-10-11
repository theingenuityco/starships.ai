'use client'

import { Sparkles } from 'lucide-react'
import Icon from '@/components/primitives/Icon'

import React, { forwardRef, useImperativeHandle, useMemo } from 'react'

import type { Blueprint } from '@starships/autopilot'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import type { AgentBuilderViewProps, AgentBuilderViewRef } from './types'
import { useAgentForm } from './hooks/useAgentForm'
import { AgentInfoPanel } from './components/AgentInfoPanel'
import { AgentConfigPanel } from './components/AgentConfigPanel'
import { AgentToolsPanel } from './components/AgentToolsPanel'
import { AgentSettingsPanel } from './components/AgentSettingsPanel'

export const AgentBuilderView = forwardRef<AgentBuilderViewRef, AgentBuilderViewProps>(({ onSave }, ref) => {
  const { formData, errors, handleFieldChange, resetForm, updateField } = useAgentForm({ onSave })

  // Parse blueprint for visualization
  const parsedBlueprint = useMemo<Blueprint | null>(() => {
    try {
      return JSON.parse(formData.blueprint)
    } catch {
      return null
    }
  }, [formData.blueprint])

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    updateField,
    getFormData: () => formData,
    resetForm,
  }))

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Main Blueprint Canvas - Full Height */}
      <div className="flex-1 relative">
        <div
          className="absolute bg-background"
          style={{
            top: 0,
            bottom: 0,
            left: '-5.5rem', // Extend background behind navigation
            right: 0,
          }}
        >
          {/* Floating Panels - Top Left */}
          <div className="absolute top-4 left-28 z-10 w-[420px] space-y-2">
            {/* Agent Info Panel */}
            <AgentInfoPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} />

            {/* Agent Config Panel */}
            <AgentConfigPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} />

            {/* Agent Tools Panel */}
            <AgentToolsPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} />

            {/* Settings Panel */}
            <AgentSettingsPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} />
          </div>

          {/* Blueprint or Empty State */}
          {parsedBlueprint && parsedBlueprint.nodes && parsedBlueprint.nodes.length > 0 ? (
            <BlueprintVisualization blueprint={parsedBlueprint} className="h-full w-full" transparent nodesDraggable />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="w-20 h-20 mx-auto rounded-full frosted-glass-card shadow-frosted-lg flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">No Blueprint Yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Start building your agent by configuring its system prompt, assigning tools, and optionally creating a custom workflow blueprint. Configure agent settings above.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

AgentBuilderView.displayName = 'AgentBuilderView'
