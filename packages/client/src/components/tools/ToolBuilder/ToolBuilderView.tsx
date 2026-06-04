'use client'

import React, { forwardRef, useImperativeHandle } from 'react'

import type { ToolBuilderViewProps, ToolBuilderViewRef } from './types'
import { useToolForm } from './hooks/useToolForm'
import { ToolInfoPanel } from './components/ToolInfoPanel'
import { ParametersPanel } from './components/ParametersPanel'
import { ToolSettingsPanel } from './components/ToolSettingsPanel'

export const ToolBuilderView = forwardRef<ToolBuilderViewRef, ToolBuilderViewProps>(({ onSave }, ref) => {
  const { formData, errors, handleFieldChange, resetForm, updateField } = useToolForm({ onSave })

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    updateField,
    getFormData: () => formData,
    resetForm,
  }))

  return (
    <div className="h-full flex flex-col bg-background">
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
            <ToolInfoPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} readonly={false} />

            {/* Parameters Panel */}
            <ParametersPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} readonly={false} />

            {/* Settings Panel */}
            <ToolSettingsPanel formData={formData} errors={errors} onFieldChange={handleFieldChange} readonly={false} />
          </div>
        </div>
      </div>
    </div>
  )
})

ToolBuilderView.displayName = 'ToolBuilderView'
