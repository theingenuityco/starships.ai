'use client'

import Icon from '@/components/primitives/Icon'

import React, { forwardRef, useImperativeHandle, useMemo } from 'react'

import type { Blueprint } from '@starships/autopilot'
import { BlueprintVisualization } from '@/components/blueprint/BlueprintVisualization'
import type { ToolBuilderViewProps, ToolBuilderViewRef } from './types'
import { useToolForm } from './hooks/useToolForm'
import { ToolInfoPanel } from './components/ToolInfoPanel'
import { ParametersPanel } from './components/ParametersPanel'
import { ToolSettingsPanel } from './components/ToolSettingsPanel'

export const ToolBuilderView = forwardRef<ToolBuilderViewRef, ToolBuilderViewProps>(({ onSave, toolId, templateId }, ref) => {
  const { formData, errors, handleFieldChange, resetForm, updateField } = useToolForm({ onSave })

  // Determine if this is a template-based tool (readonly)
  const isReadonly = !!templateId

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
          <div className="absolute top-6 left-28 z-10 w-[420px] space-y-2">
            {/* Tool Info Panel */}
            <ToolInfoPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} readonly={isReadonly} />

            {/* Parameters Panel */}
            <ParametersPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} readonly={isReadonly} />

            {/* Settings Panel */}
            <ToolSettingsPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} readonly={isReadonly} />
          </div>

          {/* Blueprint or Empty State */}
          {parsedBlueprint && parsedBlueprint.nodes && parsedBlueprint.nodes.length > 0 ? (
            <BlueprintVisualization blueprint={parsedBlueprint} className="h-full w-full" transparent nodesDraggable />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="w-20 h-20 mx-auto rounded-full frosted-glass-card shadow-frosted-lg flex items-center justify-center">
                  <Icon name="wrench" className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">No Blueprint Yet</h3>
                  <p className="text-sm text-muted-foreground">Start building your tool by adding nodes and connections to create a workflow blueprint. Configure tool settings above.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

ToolBuilderView.displayName = 'ToolBuilderView'
