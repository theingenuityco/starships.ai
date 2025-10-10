import { useState, useCallback } from 'react'
import type { AgentFormData, FormErrors } from '../types'
import { INITIAL_FORM_DATA } from '../constants'

interface UseAgentFormProps {
  onSave?: (data: AgentFormData) => void
}

export const useAgentForm = ({ onSave }: UseAgentFormProps) => {
  const [formData, setFormData] = useState<AgentFormData>(INITIAL_FORM_DATA)
  const [errors, setErrors] = useState<FormErrors>({})

  const handleFieldChange = useCallback((field: keyof AgentFormData, value: string | boolean | number | string[]) => {
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
      newErrors.name = 'Agent name is required'
    }

    if (!formData.slug.trim()) {
      newErrors.slug = 'Agent slug is required'
    } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      newErrors.slug = 'Slug must be lowercase letters, numbers, and hyphens only'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    if (!formData.model.trim()) {
      newErrors.model = 'Model is required'
    }

    if (formData.temperature < 0 || formData.temperature > 2) {
      newErrors.temperature = 'Temperature must be between 0 and 2'
    }

    if (formData.maxTokens < 1) {
      newErrors.maxTokens = 'Max tokens must be at least 1'
    }

    if (!formData.systemPrompt.trim()) {
      newErrors.systemPrompt = 'System prompt is required'
    }

    // Validate JSON blueprint
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

  const updateField = useCallback((field: keyof AgentFormData, value: string | boolean | number | string[]) => {
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
