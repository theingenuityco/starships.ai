'use client'

import React, { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

interface ParameterEditorProps {
  value: string
  onChange: (value: string) => void
  error?: string
}

export const ParameterEditor: React.FC<ParameterEditorProps> = ({ value, onChange, error }) => {
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleChange = (newValue: string) => {
    // Try to validate JSON on change
    if (newValue.trim()) {
      try {
        JSON.parse(newValue)
        setValidationError(null)
      } catch (e) {
        setValidationError('Invalid JSON syntax')
      }
    } else {
      setValidationError(null)
    }
    onChange(newValue)
  }

  return (
    <div className="space-y-2">
      <Textarea
        placeholder={`{
  "type": "object",
  "properties": {
    "param_name": {
      "type": "string",
      "description": "Parameter description"
    }
  },
  "required": ["param_name"]
}`}
        value={value}
        onChange={e => handleChange(e.target.value)}
        rows={12}
        className="text-xs font-mono resize-none"
      />
      {validationError && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-3 w-3" />
          <AlertDescription className="text-xs">{validationError}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-3 w-3" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
