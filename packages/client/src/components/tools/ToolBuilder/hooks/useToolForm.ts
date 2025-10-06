import { useState, useCallback } from 'react'
import type { ToolFormData, FormErrors } from '../types'
import { INITIAL_FORM_DATA } from '../constants'

interface UseToolFormProps {
  onSave?: (data: ToolFormData) => void
}

export const useToolForm = ({ onSave }: UseToolFormProps) => {
  const [formData, setFormData] = useState<ToolFormData>(INITIAL_FORM_DATA)
  const [errors, setErrors] = useState<FormErrors>({})

  const handleFieldChange = useCallback((field: keyof ToolFormData, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }, [])

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Tool name is required'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    // Validate JSON fields
    try {
      JSON.parse(formData.parameters)
    } catch {
      newErrors.parameters = 'Invalid JSON format'
    }

    try {
      JSON.parse(formData.blueprint)
    } catch {
      newErrors.blueprint = 'Invalid JSON format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  const handleSave = useCallback(() => {
    if (validateForm()) {
      onSave?.(formData)
    }
  }, [validateForm, onSave, formData])

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA)
    setErrors({})
  }, [])

  const updateField = useCallback((field: keyof ToolFormData, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
    // Clear error for this field when updated
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }, [])

  return {
    formData,
    errors,
    handleFieldChange,
    handleSave,
    resetForm,
    updateField,
  }
}
