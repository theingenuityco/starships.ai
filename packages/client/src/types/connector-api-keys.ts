export interface ApiKeyRequirement {
  envKey: string // Environment variable name
  displayName: string // User-friendly name
  type: 'api_key' | 'token' | 'connection_string' | 'file_path' | 'directory_path'
  placeholder: string // Placeholder text for input
  required: boolean // Whether this field is mandatory
  sensitive: boolean // Whether to mask the input
  validation?: RegExp // Optional validation pattern
  nestedKey?: string // For complex JSON structures
  helpUrl?: string // Documentation link
}

export interface ApiKeyValidationResult {
  isValid: boolean
  error?: string
}

export interface ConnectorApiKeyState {
  requirements: ApiKeyRequirement[]
  values: Record<string, string>
  validationResults: Record<string, ApiKeyValidationResult>
  isSubmitting: boolean
}
