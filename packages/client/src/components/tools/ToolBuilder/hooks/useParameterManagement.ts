import { useState, useCallback, useEffect } from 'react'
import type { Parameter } from '../types'
import { parametersToJSON, parseParametersFromJSON } from '../utils/parameterHelpers'

interface UseParameterManagementProps {
  parametersJSON: string
  onParametersChange: (json: string) => void
}

export const useParameterManagement = ({ parametersJSON, onParametersChange }: UseParameterManagementProps) => {
  const [parameters, setParameters] = useState<Parameter[]>([])

  // Parse parameters from JSON when it changes
  useEffect(() => {
    const params = parseParametersFromJSON(parametersJSON)
    setParameters(params)
  }, [parametersJSON])

  // Add new parameter (with path support for nested parameters)
  const addParameter = useCallback(
    (path: number[] = []) => {
      const newParams = [...parameters]

      if (path.length === 0) {
        // Add to root level
        newParams.push({ name: '', type: 'string' as const, description: '', required: false })
      } else {
        // Add to nested level - navigate to parent
        let target: any = newParams
        let parentParam: Parameter | undefined

        for (let i = 0; i < path.length; i++) {
          const index = path[i]

          if (i === path.length - 1) {
            // Last element - this is the parent we want to add to
            if (index === -1 && target.items) {
              parentParam = target.items
            } else {
              parentParam = target[index]
            }
          } else {
            // Navigate deeper
            if (index === -1) {
              // Navigate through array items
              if (target.items) {
                target = target.items
              }
            } else {
              const currentParam = target[index]
              if (currentParam.type === 'object' && currentParam.properties) {
                target = currentParam.properties
              } else if (currentParam.type === 'array' && currentParam.items) {
                target = currentParam
              }
            }
          }
        }

        // Add new property to the parent
        if (parentParam && parentParam.type === 'object') {
          if (!parentParam.properties) parentParam.properties = []
          parentParam.properties.push({ name: '', type: 'string' as const, description: '', required: false })
        }
      }

      setParameters(newParams)
      const json = parametersToJSON(newParams)
      onParametersChange(json)
    },
    [parameters, onParametersChange]
  )

  // Update parameter (with path support for nested parameters)
  const updateParameter = useCallback(
    (path: number[], field: keyof Parameter, value: any) => {
      const newParams = [...parameters]

      let target: any = newParams
      let param: Parameter

      // Navigate to the target parameter
      for (let i = 0; i < path.length; i++) {
        const index = path[i]

        if (i === path.length - 1) {
          // Last element in path - this is our target
          if (index === -1 && target.items) {
            // Array item schema
            param = target.items
          } else {
            param = target[index]
          }
        } else {
          // Navigate deeper
          if (index === -1) {
            // Navigate through array items
            if (target.items) {
              target = target.items
            }
          } else {
            const currentParam = target[index]
            if (currentParam.type === 'object' && currentParam.properties) {
              target = currentParam.properties
            } else if (currentParam.type === 'array' && currentParam.items) {
              target = currentParam
            }
          }
        }
      }

      param = param!
      const oldType = param.type

      // Type-safe update
      if (field === 'name' || field === 'description') {
        param[field] = value as string
      } else if (field === 'type') {
        param[field] = value as Parameter['type']
      } else if (field === 'required') {
        param[field] = value as boolean
      } else if (field === 'isExpanded') {
        param[field] = value as boolean
      }

      // Initialize nested structures when type changes
      if (field === 'type') {
        if (value === 'object' && oldType !== 'object') {
          param.properties = []
          param.isExpanded = false
        } else if (value === 'array' && oldType !== 'array') {
          param.items = { name: 'item', type: 'string', description: '', required: false }
          param.isExpanded = false
        } else if (value !== 'object' && value !== 'array') {
          delete param.properties
          delete param.items
          delete param.isExpanded
        } else if (value === 'object' && oldType === 'array') {
          delete param.items
        } else if (value === 'array' && oldType === 'object') {
          delete param.properties
        }
      }

      setParameters(newParams)
      const json = parametersToJSON(newParams)
      onParametersChange(json)
    },
    [parameters, onParametersChange]
  )

  // Remove parameter (with path support for nested parameters)
  const removeParameter = useCallback(
    (path: number[]) => {
      const newParams = [...parameters]

      if (path.length === 1) {
        // Remove from root level
        newParams.splice(path[0], 1)
      } else {
        // Remove from nested level
        let target = newParams
        for (let i = 0; i < path.length - 1; i++) {
          const param = target[path[i]]
          if (param.type === 'object' && param.properties) {
            target = param.properties
          }
        }
        target.splice(path[path.length - 1], 1)
      }

      setParameters(newParams)
      const json = parametersToJSON(newParams)
      onParametersChange(json)
    },
    [parameters, onParametersChange]
  )

  // Toggle expand/collapse for object and array parameters
  const toggleExpanded = useCallback((path: number[]) => {
    setParameters(prevParams => {
      const newParams = [...prevParams]

      let target: any = newParams
      let param: Parameter | undefined

      // Navigate to the target parameter
      for (let i = 0; i < path.length; i++) {
        const index = path[i]

        if (i === path.length - 1) {
          // Last element in path - this is our target
          if (index === -1 && target.items) {
            // Array item schema
            param = target.items
          } else {
            param = target[index]
          }
        } else {
          // Navigate deeper
          if (index === -1) {
            // Navigate through array items
            if (target.items) {
              target = target.items
            }
          } else {
            const currentParam = target[index]
            if (currentParam.type === 'object' && currentParam.properties) {
              target = currentParam.properties
            } else if (currentParam.type === 'array' && currentParam.items) {
              target = currentParam
            }
          }
        }
      }

      if (param) {
        param.isExpanded = !param.isExpanded
      }

      return newParams
    })
  }, [])

  return {
    parameters,
    addParameter,
    updateParameter,
    removeParameter,
    toggleExpanded,
  }
}
