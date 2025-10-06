'use client'

import React, { forwardRef, useImperativeHandle, useMemo } from 'react'
import { Wrench } from 'lucide-react'
import type { Blueprint } from '@starships/autopilot'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import type { ToolBuilderViewProps, ToolBuilderViewRef } from './types'
import { useToolForm } from './hooks/useToolForm'
import { useParameterManagement } from './hooks/useParameterManagement'
import { ToolInfoPanel } from './components/ToolInfoPanel'
import { ToolSettingsPanel } from './components/ToolSettingsPanel'

export const ToolBuilderView = forwardRef<ToolBuilderViewRef, ToolBuilderViewProps>(({ onSave }, ref) => {
  const { formData, errors, handleFieldChange, resetForm, updateField } = useToolForm({ onSave })

  const { parameters, addParameter, updateParameter, removeParameter, toggleExpanded } = useParameterManagement({
    parametersJSON: formData.parameters,
    onParametersChange: json => handleFieldChange('parameters', json),
  })

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
          className="absolute bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(156, 163, 175, 0.4) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            top: 0,
            bottom: 0,
            left: '-5.5rem', // Extend background behind navigation
            right: 0,
          }}
        >
          {/* Floating Panels - Top Left */}
          <div className="absolute top-4 left-28 z-10 w-[420px] space-y-2">
            {/* Tool Info Panel */}
            <ToolInfoPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} />

            {/* Settings Panel */}
            <ToolSettingsPanel
              formData={formData}
              errors={errors}
              parameters={parameters}
              onFieldChange={handleFieldChange}
              onAddParameter={addParameter}
              onUpdateParameter={updateParameter}
              onRemoveParameter={removeParameter}
              onToggleExpanded={toggleExpanded}
            />
          </div>

          {/* Blueprint or Empty State */}
          {parsedBlueprint && parsedBlueprint.nodes && parsedBlueprint.nodes.length > 0 ? (
            <BlueprintVisualization blueprint={parsedBlueprint} className="h-full w-full" transparent />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="w-20 h-20 mx-auto rounded-full frosted-glass-card shadow-frosted-lg flex items-center justify-center">
                  <Wrench className="w-10 h-10 text-muted-foreground/50" />
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
