import { useState, useCallback } from 'react'
import type { ToolFormData, FormErrors } from '../types'
import { INITIAL_FORM_DATA } from '../constants'

interface UseToolFormProps {
  onSave?: (data: ToolFormData) => void
  persistenceKey?: string
}

export const useToolForm = ({ onSave, persistenceKey }: UseToolFormProps) => {
  // Initialize from localStorage draft if available
  const [formData, setFormData] = useState<ToolFormData>(() => {
    if (typeof window === 'undefined' || !persistenceKey) return INITIAL_FORM_DATA
    try {
      const raw = window.localStorage.getItem(`toolBuilder:draft:${persistenceKey}`)
      if (!raw) return INITIAL_FORM_DATA
      const parsed = JSON.parse(raw)
      return { ...INITIAL_FORM_DATA, ...(parsed as Partial<ToolFormData>) }
    } catch {
      return INITIAL_FORM_DATA
    }
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const saveTimerRef = useRef<number | null>(null)

  const handleFieldChange = useCallback((field: keyof ToolFormData, value: string | boolean) => {
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
      // Clear draft on successful save
      if (typeof window !== 'undefined' && persistenceKey) {
        try {
          window.localStorage.removeItem(`toolBuilder:draft:${persistenceKey}`)
        } catch {}
      }
    }
  }, [validateForm, onSave, formData, persistenceKey])

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA)
    setErrors({})
    if (typeof window !== 'undefined' && persistenceKey) {
      try {
        window.localStorage.removeItem(`toolBuilder:draft:${persistenceKey}`)
      } catch {}
    }
  }, [persistenceKey])

  const updateField = useCallback((field: keyof ToolFormData, value: string | boolean) => {
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
    const isEmptyInitial = formData.name === '' && formData.description === '' && formData.parameters === INITIAL_FORM_DATA.parameters && formData.blueprint === INITIAL_FORM_DATA.blueprint
    if (isEmptyInitial) return
    saveTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`toolBuilder:draft:${persistenceKey}`, JSON.stringify(formData))
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
