'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Check } from 'lucide-react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

interface ParameterEditorProps {
  value: string
  onChange: (value: string) => void
  error?: string
}

interface ValidationError {
  message: string
  details: string | null
}

export const ParameterEditor: React.FC<ParameterEditorProps> = ({ value, onChange, error }) => {
  const [validationError, setValidationError] = useState<ValidationError | null>(null)
  const [isValid, setIsValid] = useState<boolean>(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)

  // Validate JSON Schema structure
  const validateJsonSchema = (jsonString: string) => {
    if (!jsonString.trim()) {
      setValidationError(null)
      setIsValid(false)
      updateEditorMarkers([])
      return
    }

    try {
      const parsed = JSON.parse(jsonString)

      // Check if it's a valid JSON Schema for parameters
      if (parsed.type !== 'object') {
        const error = {
          message: 'Schema must have type: "object"',
          details: 'The root schema must be an object type to define parameters',
        }
        setValidationError(error)
        setIsValid(false)
        updateEditorMarkers([
          {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 100,
            message: error.message,
            severity: 8, // Error
          },
        ])
        return
      }

      if (!parsed.properties || typeof parsed.properties !== 'object') {
        const error = {
          message: 'Schema must have a "properties" field',
          details: 'Define parameter properties using the "properties" field',
        }
        setValidationError(error)
        setIsValid(false)
        updateEditorMarkers([
          {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 100,
            message: error.message,
            severity: 8,
          },
        ])
        return
      }

      if (Object.keys(parsed.properties).length === 0) {
        const error = {
          message: 'At least one parameter must be defined',
          details: 'Add properties to define the parameters for your tool',
        }
        setValidationError(error)
        setIsValid(false)
        updateEditorMarkers([
          {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 100,
            message: error.message,
            severity: 8,
          },
        ])
        return
      }

      // Validate each property
      for (const [key, prop] of Object.entries(parsed.properties)) {
        if (typeof prop !== 'object' || prop === null) {
          const error = {
            message: `Invalid property definition: ${key}`,
            details: 'Each property must be an object with at least a "type" field',
          }
          setValidationError(error)
          setIsValid(false)
          updateEditorMarkers([
            {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 100,
              message: error.message,
              severity: 8,
            },
          ])
          return
        }

        const propObj = prop as Record<string, unknown>
        if (!propObj.type) {
          const error = {
            message: `Missing "type" for property: ${key}`,
            details: 'Each property must specify a type (string, number, boolean, object, array)',
          }
          setValidationError(error)
          setIsValid(false)
          updateEditorMarkers([
            {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 100,
              message: error.message,
              severity: 8,
            },
          ])
          return
        }
      }

      setValidationError(null)
      setIsValid(true)
      updateEditorMarkers([])
    } catch (e) {
      const err = e as Error
      setValidationError({
        message: 'Invalid JSON syntax',
        details: err.message,
      })
      setIsValid(false)
      // Monaco will show JSON syntax errors automatically
    }
  }

  const updateEditorMarkers = (markers: editor.IMarkerData[]) => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        monacoRef.current.editor.setModelMarkers(model, 'json-schema-validation', markers)
      }
    }
  }

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Configure JSON language options
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [],
      enableSchemaRequest: false,
    })

    // Validate initial value
    validateJsonSchema(value)
  }

  const handleChange = (newValue: string | undefined) => {
    const val = newValue || ''
    onChange(val)
    validateJsonSchema(val)
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

      {/* Monaco Editor */}
      <div className="relative rounded-md border border-input overflow-hidden">
        <Editor
          height="300px"
          defaultLanguage="json"
          value={value}
          onChange={handleChange}
          onMount={handleEditorDidMount}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'off',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            wrappingIndent: 'indent',
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            formatOnPaste: true,
            formatOnType: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            folding: false,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            guides: {
              bracketPairs: false,
              bracketPairsHorizontal: false,
              highlightActiveBracketPair: false,
            },
          }}
        />
      </div>

      {/* Validation Messages */}
      {validationError && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-3 w-3" />
          <AlertDescription className="text-xs">
            <p className="font-medium">{validationError.message}</p>
            {validationError.details && <p className="text-[10px] mt-1 opacity-90">{validationError.details}</p>}
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
