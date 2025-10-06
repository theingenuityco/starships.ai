'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Check } from 'lucide-react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useTheme } from 'next-themes'

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
  const decorationsRef = useRef<string[]>([])
  const viewZonesRef = useRef<string[]>([])
  const { theme } = useTheme()

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

  // Function to find property ranges in the JSON schema with metadata
  const findPropertyRanges = (
    jsonString: string
  ): Array<{
    startLine: number
    endLine: number
    propertyName: string
    indentation: number
    metadata: {
      type: string
      description?: string
      required: boolean
      enum?: unknown[]
      default?: unknown
    }
  }> => {
    const ranges: Array<{
      startLine: number
      endLine: number
      propertyName: string
      indentation: number
      metadata: {
        type: string
        description?: string
        required: boolean
        enum?: unknown[]
        default?: unknown
      }
    }> = []

    try {
      const parsed = JSON.parse(jsonString)
      if (!parsed.properties || typeof parsed.properties !== 'object') {
        return ranges
      }

      const lines = jsonString.split('\n')
      const propertyNames = Object.keys(parsed.properties)
      const requiredFields = Array.isArray(parsed.required) ? parsed.required : []

      // Find the "properties" line
      let propertiesLineIndex = -1
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('"properties"') && lines[i].includes(':')) {
          propertiesLineIndex = i
          break
        }
      }

      if (propertiesLineIndex === -1) return ranges

      // For each property, find its start and end lines
      propertyNames.forEach(propName => {
        let propStartLine = -1
        let propEndLine = -1
        let depth = 0
        let foundProp = false
        let indentation = 0

        for (let i = propertiesLineIndex + 1; i < lines.length; i++) {
          const line = lines[i]

          // Check if this line contains the property name
          if (!foundProp && line.includes(`"${propName}"`) && line.includes(':')) {
            propStartLine = i
            foundProp = true

            // Calculate indentation (number of spaces at the start of the line)
            const match = line.match(/^(\s*)/)
            indentation = match ? match[1].length : 0

            // Check if the property object starts on the same line
            if (line.includes('{')) {
              depth = 1
            }
            continue
          }

          if (foundProp) {
            // Count braces to track depth
            const openBraces = (line.match(/{/g) || []).length
            const closeBraces = (line.match(/}/g) || []).length
            depth += openBraces - closeBraces

            // When depth returns to 0, we've found the end of this property
            if (depth === 0) {
              propEndLine = i

              // Extract metadata for this property
              const propDef = parsed.properties[propName] as Record<string, unknown>
              const metadata = {
                type: String(propDef.type || 'unknown'),
                description: propDef.description ? String(propDef.description) : undefined,
                required: requiredFields.includes(propName),
                enum: propDef.enum as unknown[] | undefined,
                default: propDef.default,
              }

              ranges.push({
                startLine: propStartLine,
                endLine: propEndLine,
                propertyName: propName,
                indentation,
                metadata,
              })
              break
            }
          }
        }
      })
    } catch (e) {
      // Ignore parsing errors
      console.error('Error finding property ranges:', e)
    }

    return ranges
  }

  // Function to create metadata DOM node for view zone
  const createMetadataNode = (
    metadata: {
      type: string
      description?: string
      required: boolean
      enum?: unknown[]
      default?: unknown
    },
    propertyName: string,
    indentation: number
  ): HTMLDivElement => {
    const container = document.createElement('div')
    container.className = 'parameter-metadata-zone'
    container.style.cssText = `
      padding: 0 0 2px 0;
      font-size: 10px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
      color: ${theme === 'dark' ? '#64748b' : '#94a3b8'};
      opacity: 0.6;
      display: flex;
      align-items: flex-end;
      height: 100%;
      user-select: none;
      pointer-events: none;
    `

    // Parameter name and type
    const text = document.createElement('span')
    text.style.cssText = `
      font-weight: 400;
      letter-spacing: 0.01em;
    `
    text.textContent = `${propertyName}: ${metadata.type}`
    container.appendChild(text)

    return container
  }

  // Function to apply property decorations
  const applyPropertyDecorations = () => {
    if (!editorRef.current || !monacoRef.current) return

    // Only apply decorations if we have valid JSON
    try {
      JSON.parse(value)
    } catch (e) {
      // Clear existing view zones and decorations if JSON is invalid
      editorRef.current.changeViewZones(changeAccessor => {
        viewZonesRef.current.forEach(id => {
          changeAccessor.removeZone(id)
        })
        viewZonesRef.current = []
      })
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [])
      return
    }

    const ranges = findPropertyRanges(value)
    const decorations: editor.IModelDeltaDecoration[] = []

    // Clear old view zones
    editorRef.current.changeViewZones(changeAccessor => {
      viewZonesRef.current.forEach(id => {
        changeAccessor.removeZone(id)
      })
      viewZonesRef.current = []
    })

    // Add new view zones and decorations
    editorRef.current.changeViewZones(changeAccessor => {
      ranges.forEach((range, index) => {
        const model = editorRef.current!.getModel()
        if (!model) return

        // Add metadata view zone above each property
        const metadataNode = createMetadataNode(range.metadata, range.propertyName, range.indentation)
        const metadataZoneId = changeAccessor.addZone({
          afterLineNumber: range.startLine,
          heightInLines: 1,
          domNode: metadataNode,
        })
        viewZonesRef.current.push(metadataZoneId)

        // Add small spacing zone after metadata (except for the first property)
        if (index > 0) {
          const spacingDiv = document.createElement('div')
          const spacingZoneId = changeAccessor.addZone({
            afterLineNumber: range.startLine,
            heightInLines: 0.3,
            domNode: spacingDiv,
          })
          viewZonesRef.current.push(spacingZoneId)
        }

        const numLines = range.endLine - range.startLine + 1

        // For single-line properties
        if (numLines === 1) {
          decorations.push({
            range: new monacoRef.current!.Range(range.startLine + 1, 1, range.startLine + 1, model.getLineMaxColumn(range.startLine + 1)),
            options: {
              isWholeLine: true,
              className: 'property-box-single',
              glyphMarginClassName: 'property-group-glyph',
            },
          })
        } else {
          // For multi-line properties, create box effect
          // First line (top border + sides)
          decorations.push({
            range: new monacoRef.current!.Range(range.startLine + 1, 1, range.startLine + 1, model.getLineMaxColumn(range.startLine + 1)),
            options: {
              isWholeLine: true,
              className: 'property-box-top',
              glyphMarginClassName: 'property-group-glyph',
            },
          })

          // Middle lines (sides only)
          for (let i = range.startLine + 1; i < range.endLine; i++) {
            decorations.push({
              range: new monacoRef.current!.Range(i + 1, 1, i + 1, model.getLineMaxColumn(i + 1)),
              options: {
                isWholeLine: true,
                className: 'property-box-middle',
              },
            })
          }

          // Last line (bottom border + sides)
          decorations.push({
            range: new monacoRef.current!.Range(range.endLine + 1, 1, range.endLine + 1, model.getLineMaxColumn(range.endLine + 1)),
            options: {
              isWholeLine: true,
              className: 'property-box-bottom',
            },
          })
        }
      })
    })

    // Clear old decorations and apply new ones
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, decorations)
  }

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Define custom dark theme matching the app's dark theme
    monaco.editor.defineTheme('starships-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'string.key.json', foreground: '9cdcfe' },
        { token: 'string.value.json', foreground: 'ce9178' },
        { token: 'number', foreground: 'b5cea8' },
        { token: 'keyword', foreground: '569cd6' },
        { token: 'comment', foreground: '6a9955' },
        { token: 'delimiter', foreground: 'd4d4d4' },
      ],
      colors: {
        'editor.background': '#00000000', // Transparent to show frosted-glass background
        'editor.foreground': '#f2f2f2', // hsl(0 0% 95%) - matches --foreground
        'editorLineNumber.foreground': '#4a5568',
        'editor.selectionBackground': '#2e3541', // hsl(220 15% 20%) - matches --border
        'editor.inactiveSelectionBackground': '#171a20',
        'editorCursor.foreground': '#3b82f6', // matches primary color
        'editor.lineHighlightBackground': '#ffffff08', // Subtle tint for active line
        'editorWidget.background': '#171a20',
        'editorSuggestWidget.background': '#171a20',
        'editorHoverWidget.background': '#171a20',
        contrastBorder: '#00000000', // Remove contrast border
        contrastActiveBorder: '#00000000', // Remove active contrast border
        focusBorder: '#00000000', // Remove focus border
      },
    })

    // Define custom light theme matching the app's light theme
    monaco.editor.defineTheme('starships-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'string.key.json', foreground: '0070c1' },
        { token: 'string.value.json', foreground: 'a31515' },
        { token: 'number', foreground: '098658' },
        { token: 'keyword', foreground: '0000ff' },
        { token: 'comment', foreground: '008000' },
        { token: 'delimiter', foreground: '000000' },
      ],
      colors: {
        'editor.background': '#00000000', // Transparent to show frosted-glass background
        'editor.foreground': '#141414', // hsl(0 0% 8%) - matches --foreground
        'editorLineNumber.foreground': '#999999',
        'editor.selectionBackground': '#add6ff',
        'editor.inactiveSelectionBackground': '#e5ebf1',
        'editorCursor.foreground': '#3b82f6', // matches primary color
        'editor.lineHighlightBackground': '#00000008', // Subtle tint for active line
        'editorWidget.background': '#ffffff',
        'editorSuggestWidget.background': '#ffffff',
        'editorHoverWidget.background': '#ffffff',
        contrastBorder: '#00000000', // Remove contrast border
        contrastActiveBorder: '#00000000', // Remove active contrast border
        focusBorder: '#00000000', // Remove focus border
      },
    })

    // Apply the theme based on current mode
    const currentTheme = theme === 'dark' ? 'starships-dark' : 'starships-light'
    monaco.editor.setTheme(currentTheme)

    // Configure JSON language options
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [],
      enableSchemaRequest: false,
    })

    // Validate initial value
    validateJsonSchema(value)

    // Apply property decorations after a short delay to ensure editor is ready
    setTimeout(() => applyPropertyDecorations(), 100)
  }

  // Update theme when it changes
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      const currentTheme = theme === 'dark' ? 'starships-dark' : 'starships-light'
      monacoRef.current.editor.setTheme(currentTheme)
    }
  }, [theme])

  const handleChange = (newValue: string | undefined) => {
    const val = newValue || ''
    onChange(val)
    validateJsonSchema(val)

    // Reapply decorations when content changes
    setTimeout(() => applyPropertyDecorations(), 50)
  }

  useEffect(() => {
    validateJsonSchema(value)
  }, [])

  return (
    <div className="space-y-2">
      {/* Monaco Editor */}
      <div className="relative rounded-b-xl overflow-hidden">
        <div className="pr-4 frosted-glass-card">
          <Editor
            height="300px"
            defaultLanguage="json"
            value={value}
            onChange={handleChange}
            onMount={handleEditorDidMount}
            theme={theme === 'dark' ? 'starships-dark' : 'starships-light'}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'off',
              glyphMargin: true,
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
              stickyScroll: { enabled: false },
              padding: { top: 12, bottom: 12 },
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
                useShadows: false,
                alwaysConsumeMouseWheel: false,
              },
              guides: {
                bracketPairs: false,
                bracketPairsHorizontal: false,
                highlightActiveBracketPair: false,
              },
            }}
          />
        </div>
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
