'use client'

import React, { useState, useEffect } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Check } from 'lucide-react'
import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-json'

interface ParameterEditorProps {
  value: string
  onChange: (value: string) => void
  error?: string
}

export const ParameterEditor: React.FC<ParameterEditorProps> = ({ value, onChange, error }) => {
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validationDetails, setValidationDetails] = useState<string | null>(null)
  const [isValid, setIsValid] = useState<boolean>(false)

  // Validate JSON Schema structure
  const validateJsonSchema = (jsonString: string) => {
    if (!jsonString.trim()) {
      setValidationError(null)
      setValidationDetails(null)
      setIsValid(false)
      return
    }

    try {
      const parsed = JSON.parse(jsonString)

      // Check if it's a valid JSON Schema for parameters
      if (parsed.type !== 'object') {
        setValidationError('Schema must have type: "object"')
        setValidationDetails('The root schema must be an object type to define parameters')
        setIsValid(false)
        return
      }

      if (!parsed.properties || typeof parsed.properties !== 'object') {
        setValidationError('Schema must have a "properties" field')
        setValidationDetails('Define parameter properties using the "properties" field')
        setIsValid(false)
        return
      }

      if (Object.keys(parsed.properties).length === 0) {
        setValidationError('At least one parameter must be defined')
        setValidationDetails('Add properties to define the parameters for your tool')
        setIsValid(false)
        return
      }

      // Validate each property
      for (const [key, prop] of Object.entries(parsed.properties)) {
        if (typeof prop !== 'object' || prop === null) {
          setValidationError(`Invalid property definition: ${key}`)
          setValidationDetails('Each property must be an object with at least a "type" field')
          setIsValid(false)
          return
        }

        const propObj = prop as Record<string, unknown>
        if (!propObj.type) {
          setValidationError(`Missing "type" for property: ${key}`)
          setValidationDetails('Each property must specify a type (string, number, boolean, object, array)')
          setIsValid(false)
          return
        }
      }

      setValidationError(null)
      setValidationDetails(null)
      setIsValid(true)
    } catch (e) {
      const error = e as Error
      setValidationError('Invalid JSON syntax')
      setValidationDetails(error.message)
      setIsValid(false)
    }
  }

  const handleChange = (newValue: string) => {
    onChange(newValue)
    validateJsonSchema(newValue)
  }

  const highlightCode = (code: string) => {
    return Prism.highlight(code, Prism.languages.json, 'json')
  }

  useEffect(() => {
    validateJsonSchema(value)
  }, [])

  return (
    <div className="space-y-2">
      {/* Validation Status */}
      {isValid && (
        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <Check className="h-3 w-3" />
          <span className="text-[10px] font-medium">Valid Schema</span>
        </div>
      )}

      {/* Editor with Syntax Highlighting */}
      <div className="relative rounded-md border border-input bg-background overflow-hidden">
        <Editor
          value={value}
          onValueChange={handleChange}
          highlight={highlightCode}
          padding={12}
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
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '12px',
            minHeight: '300px',
            outline: 'none',
          }}
          textareaClassName="focus-visible:outline-none"
        />
      </div>

      {/* Validation Messages */}
      {validationError && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-3 w-3" />
          <AlertDescription className="text-xs">
            <p className="font-medium">{validationError}</p>
            {validationDetails && <p className="text-[10px] mt-1 opacity-90">{validationDetails}</p>}
          </AlertDescription>
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
