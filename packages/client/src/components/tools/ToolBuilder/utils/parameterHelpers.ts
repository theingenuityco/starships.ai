import type { Parameter } from '../types'

// Recursive function to convert JSON schema to Parameter
export const jsonToParam = (name: string, schema: any, isRequired: boolean): Parameter => {
  const param: Parameter = {
    name,
    type: schema.type || 'string',
    description: schema.description || '',
    required: isRequired,
  }

  // Parse nested object properties
  if (schema.type === 'object' && schema.properties) {
    param.properties = Object.entries(schema.properties).map(([propName, propSchema]: [string, any]) => jsonToParam(propName, propSchema, schema.required?.includes(propName) || false))
  }

  // Parse array items
  if (schema.type === 'array' && schema.items) {
    param.items = jsonToParam('item', schema.items, false)
  }

  return param
}

// Convert parameters to JSON schema (with nested support)
export const parametersToJSON = (params: Parameter[]): string => {
  const properties: Record<string, any> = {}
  const required: string[] = []

  const paramToSchema = (param: Parameter): any => {
    const schema: any = {
      type: param.type,
      description: param.description,
    }

    // Handle nested object properties
    if (param.type === 'object' && param.properties && param.properties.length > 0) {
      schema.properties = {}
      schema.required = []
      param.properties.forEach(prop => {
        schema.properties[prop.name] = paramToSchema(prop)
        if (prop.required) {
          schema.required.push(prop.name)
        }
      })
      if (schema.required.length === 0) {
        delete schema.required
      }
    }

    // Handle array items
    if (param.type === 'array' && param.items) {
      schema.items = paramToSchema(param.items)
    }

    return schema
  }

  params.forEach(param => {
    properties[param.name] = paramToSchema(param)
    if (param.required) {
      required.push(param.name)
    }
  })

  return JSON.stringify(
    {
      type: 'object',
      properties,
      required,
    },
    null,
    2
  )
}

// Parse parameters from JSON string
export const parseParametersFromJSON = (jsonString: string): Parameter[] => {
  try {
    const parsed = JSON.parse(jsonString)

    if (parsed.properties) {
      return Object.entries(parsed.properties).map(([name, prop]: [string, any]) => jsonToParam(name, prop, parsed.required?.includes(name) || false))
    }
    return []
  } catch {
    // Invalid JSON, return empty parameters
    return []
  }
}
