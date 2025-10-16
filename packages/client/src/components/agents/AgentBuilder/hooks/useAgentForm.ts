import { useState, useCallback, useEffect, useRef } from 'react'
import type { AgentFormData, FormErrors } from '../types'
import { INITIAL_FORM_DATA } from '../constants'

interface UseAgentFormProps {
  onSave?: (data: AgentFormData) => void
  persistenceKey?: string
}

export const useAgentForm = ({ onSave, persistenceKey }: UseAgentFormProps) => {
  // Initialize from localStorage draft if available
  const [formData, setFormData] = useState<AgentFormData>(() => {
    if (typeof window === 'undefined' || !persistenceKey) return INITIAL_FORM_DATA
    try {
      const raw = window.localStorage.getItem(`agentBuilder:draft:${persistenceKey}`)
      if (!raw) return INITIAL_FORM_DATA
      const parsed = JSON.parse(raw)
      // Basic shape merge to avoid missing keys
      return { ...INITIAL_FORM_DATA, ...(parsed as Partial<AgentFormData>) }
    } catch {
      return INITIAL_FORM_DATA
    }
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const saveTimerRef = useRef<number | null>(null)

  const handleFieldChange = useCallback((field: keyof AgentFormData, value: string | boolean | number | string[]) => {
    setFormData(prev => {
      const current = prev[field] as unknown
      let nextValue: any = value as any
      if (nextValue == null) {
        if (typeof current === 'string') nextValue = ''
        else if (typeof current === 'number') nextValue = 0
        else if (typeof current === 'boolean') nextValue = false
        else if (Array.isArray(current)) nextValue = []
      }
      return {
        ...prev,
        [field]: nextValue,
      }
    })
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
      // Clear draft on successful save
      if (typeof window !== 'undefined' && persistenceKey) {
        try {
          window.localStorage.removeItem(`agentBuilder:draft:${persistenceKey}`)
        } catch {}
      }
    }
  }, [validateForm, onSave, formData, persistenceKey])

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA)
    setErrors({})
    // Clear draft on reset
    if (typeof window !== 'undefined' && persistenceKey) {
      try {
        window.localStorage.removeItem(`agentBuilder:draft:${persistenceKey}`)
      } catch {}
    }
  }, [persistenceKey])

  const updateField = useCallback((field: keyof AgentFormData, value: string | boolean | number | string[]) => {
    setFormData(prev => {
      const current = prev[field] as unknown
      let nextValue: any = value as any
      if (nextValue == null) {
        if (typeof current === 'string') nextValue = ''
        else if (typeof current === 'number') nextValue = 0
        else if (typeof current === 'boolean') nextValue = false
        else if (Array.isArray(current)) nextValue = []
      }
      return {
        ...prev,
        [field]: nextValue,
      }
    })
    // Clear error for this field when updated
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }, [])

  // Debounced persistence of formData to localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || !persistenceKey) return
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    // Avoid saving obviously empty initial state to not overwrite existing drafts
    const isEmptyInitial = formData.name === '' && formData.slug === '' && formData.description === '' && formData.systemPrompt === '' && (formData.assignedToolSlugs || []).length === 0
    if (isEmptyInitial) return
    saveTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`agentBuilder:draft:${persistenceKey}`, JSON.stringify(formData))
      } catch {}
    }, 300)
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [formData, persistenceKey])

  return {
    formData,
    errors,
    handleFieldChange,
    handleSave,
    resetForm,
    updateField,
  }
}
