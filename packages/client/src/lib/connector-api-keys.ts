import {
  ApiKeyRequirement,
  ApiKeyValidationResult,
  ConnectorApiKeyState,
} from '../types/connector-api-keys'
import { MCPServerOption } from './api'

/**
 * ConnectorApiKeyManager - Core utility for detecting and managing API key requirements
 * from MCP Server Option templates and handling user-provided keys with environment variables.
 */
export class ConnectorApiKeyManager {
  private static readonly API_KEY_PATTERNS = [
    // Common API key patterns
    /\$\{([A-Z_]+_API_KEY)\}/g,
    /\$\{([A-Z_]+_TOKEN)\}/g,
    /\$\{([A-Z_]+_SECRET)\}/g,
    /\$\{([A-Z_]+_ACCESS_TOKEN)\}/g,
    /\$\{([A-Z_]+_AUTH_TOKEN)\}/g,
    /\$\{([A-Z_]+_BEARER_TOKEN)\}/g,

    // Connection strings and URLs
    /\$\{([A-Z_]+_URL)\}/g,
    /\$\{([A-Z_]+_CONNECTION_STRING)\}/g,
    /\$\{([A-Z_]+_DATABASE_URL)\}/g,
    /\$\{([A-Z_]+_ENDPOINT)\}/g,

    // File and directory paths
    /\$\{([A-Z_]+_PATH)\}/g,
    /\$\{([A-Z_]+_FILE)\}/g,
    /\$\{([A-Z_]+_DIR)\}/g,
    /\$\{([A-Z_]+_DIRECTORY)\}/g,

    // Generic patterns
    /\$\{([A-Z_]+_KEY)\}/g,
    /\$\{([A-Z_]+_ID)\}/g,
    /\$\{([A-Z_]+_CLIENT_ID)\}/g,
    /\$\{([A-Z_]+_CLIENT_SECRET)\}/g,
  ]

  private static readonly VALIDATION_PATTERNS = {
    api_key: undefined, // Removed strict validation - accept any non-empty string
    token: undefined, // Removed strict validation - accept any non-empty string
    connection_string: /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/.+/,
    file_path: /^[^\0]+$/,
    directory_path: /^[^\0]+$/,
  }

  private static readonly HELP_URLS = {
    OPENAI_API_KEY: 'https://platform.openai.com/api-keys',
    ANTHROPIC_API_KEY: 'https://console.anthropic.com/settings/keys',
    DISCORD_TOKEN: 'https://discord.com/developers/applications',
  }

  /**
   * Auto-detect API key requirements from an MCPServerOption template
   */
  public static detectRequirements(template: MCPServerOption): ApiKeyRequirement[] {
    const requirements: ApiKeyRequirement[] = []
    const foundKeys = new Set<string>()

    // Log template analysis for debugging (can be removed in production)
    console.log('[ConnectorApiKeyManager] Analyzing template:', template.name)

    // Check environment variables JSON string
    if (template.env) {
      try {
        const envVars = this.parseEnvironmentVariables(template.env)

        for (const [key, value] of Object.entries(envVars)) {
          if (typeof value === 'string') {
            // Method 1: Check for placeholder patterns in values (existing logic)
            const placeholders = this.extractPlaceholders(value)

            for (const placeholder of placeholders) {
              if (!foundKeys.has(placeholder)) {
                foundKeys.add(placeholder)
                requirements.push(this.createRequirement(placeholder, template))
              }
            }

            // Method 2: Check if the environment variable key itself looks like an API key requirement
            // This handles cases where env vars are stored as {"STRIPE_API_KEY": "your-key-here"}
            if (this.isApiKeyEnvironmentVariable(key) && !foundKeys.has(key)) {
              foundKeys.add(key)
              requirements.push(this.createRequirement(key, template))
            }
          }
        }
      } catch (error) {
        console.warn('[ConnectorApiKeyManager] Failed to parse environment variables:', error)
      }
    }

    // Check command arguments
    for (const arg of template.args) {
      const placeholders = this.extractPlaceholders(arg)

      for (const placeholder of placeholders) {
        if (!foundKeys.has(placeholder)) {
          foundKeys.add(placeholder)
          requirements.push(this.createRequirement(placeholder, template))
        }
      }
    }

    // Check command itself
    const commandPlaceholders = this.extractPlaceholders(template.command)

    for (const placeholder of commandPlaceholders) {
      if (!foundKeys.has(placeholder)) {
        foundKeys.add(placeholder)
        requirements.push(this.createRequirement(placeholder, template))
      }
    }

    return requirements.sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  /**
   * Extract placeholder variables from a string using all known patterns
   */
  private static extractPlaceholders(text: string): string[] {
    const placeholders = new Set<string>()

    for (const pattern of this.API_KEY_PATTERNS) {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        if (match[1]) {
          placeholders.add(match[1])
        }
      }
    }

    return Array.from(placeholders)
  }

  /**
   * Parse environment variables JSON string safely
   */
  private static parseEnvironmentVariables(envString: string): Record<string, any> {
    try {
      return JSON.parse(envString)
    } catch (error) {
      // Try to parse as key=value pairs if JSON parsing fails
      const envVars: Record<string, string> = {}
      const lines = envString.split('\n')

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=')
          if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join('=').trim()
          }
        }
      }

      return envVars
    }
  }

  /**
   * Create an ApiKeyRequirement from a placeholder variable
   */
  private static createRequirement(envKey: string, template: MCPServerOption): ApiKeyRequirement {
    const type = this.determineKeyType(envKey)
    const displayName = this.generateDisplayName(envKey)
    const placeholder = this.generatePlaceholder(envKey, type)
    const validation = this.VALIDATION_PATTERNS[type]
    const helpUrl = this.HELP_URLS[envKey as keyof typeof this.HELP_URLS]

    return {
      envKey,
      displayName,
      type,
      placeholder,
      required: true, // Default to required, can be overridden
      sensitive: this.isSensitiveKey(envKey),
      validation,
      helpUrl,
    }
  }

  /**
   * Determine the type of API key based on the environment variable name
   */
  private static determineKeyType(envKey: string): ApiKeyRequirement['type'] {
    const key = envKey.toUpperCase()

    if (key.includes('CONNECTION_STRING') || key.includes('DATABASE_URL')) {
      return 'connection_string'
    }
    if (key.includes('PATH') || key.includes('FILE')) {
      return 'file_path'
    }
    if (key.includes('DIR') || key.includes('DIRECTORY')) {
      return 'directory_path'
    }
    if (key.includes('TOKEN') || key.includes('BEARER') || key.includes('ACCESS')) {
      return 'token'
    }

    return 'api_key' // Default type
  }

  /**
   * Generate a user-friendly display name from environment variable name
   */
  private static generateDisplayName(envKey: string): string {
    return envKey
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ')
  }

  /**
   * Generate placeholder text for input fields
   */
  private static generatePlaceholder(envKey: string, type: ApiKeyRequirement['type']): string {
    const service = envKey.split('_')[0].toLowerCase()

    switch (type) {
      case 'api_key':
        return `Enter your ${service} API key`
      case 'token':
        return `Enter your ${service} token`
      case 'connection_string':
        return `Enter your ${service} connection string`
      case 'file_path':
        return `Enter the file path`
      case 'directory_path':
        return `Enter the directory path`
      default:
        return `Enter your ${service} credentials`
    }
  }

  /**
   * Check if an environment variable name looks like it requires an API key
   * This handles cases where env vars are stored as plain keys like "STRIPE_API_KEY"
   */
  private static isApiKeyEnvironmentVariable(envKey: string): boolean {
    const key = envKey.toUpperCase()
    const apiKeyPatterns = [
      'API_KEY',
      'TOKEN',
      'SECRET',
      'ACCESS_TOKEN',
      'AUTH_TOKEN',
      'BEARER_TOKEN',
      'CLIENT_SECRET',
      'PRIVATE_KEY',
      'CONNECTION_STRING',
      'DATABASE_URL',
      '_URL', // For service URLs that might need configuration
      '_ENDPOINT',
      '_KEY', // Generic key pattern
      '_ID', // For client IDs that might be sensitive
    ]

    // Check if the environment variable name contains any API key patterns
    return apiKeyPatterns.some(pattern => key.includes(pattern))
  }

  /**
   * Determine if a key should be treated as sensitive (masked in UI)
   */
  private static isSensitiveKey(envKey: string): boolean {
    const key = envKey.toUpperCase()
    const sensitivePatterns = [
      'API_KEY',
      'TOKEN',
      'SECRET',
      'PASSWORD',
      'PRIVATE_KEY',
      'CLIENT_SECRET',
      'AUTH',
      'BEARER',
      'ACCESS_TOKEN',
    ]

    return sensitivePatterns.some(pattern => key.includes(pattern))
  }

  /**
   * Validate an API key value against its requirement
   */
  public static validateApiKey(
    requirement: ApiKeyRequirement,
    value: string
  ): ApiKeyValidationResult {
    if (!value || value.trim() === '') {
      if (requirement.required) {
        return {
          isValid: false,
          error: `${requirement.displayName} is required`,
        }
      }
      return { isValid: true }
    }

    const trimmedValue = value.trim()

    // Check validation pattern if provided
    if (requirement.validation && !requirement.validation.test(trimmedValue)) {
      return {
        isValid: false,
        error: `${requirement.displayName} format is invalid`,
      }
    }

    // Additional type-specific validation
    switch (requirement.type) {
      case 'connection_string':
        if (!trimmedValue.includes('://')) {
          return {
            isValid: false,
            error: 'Connection string must include a protocol (e.g., https://)',
          }
        }
        break

      case 'file_path':
      case 'directory_path':
        if (trimmedValue.includes('\0')) {
          return {
            isValid: false,
            error: 'Path cannot contain null characters',
          }
        }
        break

      case 'api_key':
      case 'token':
        // Removed strict length validation - accept any non-empty string
        break
    }

    return { isValid: true }
  }

  /**
   * Mask sensitive values for display purposes
   */
  public static maskValue(value: string, requirement: ApiKeyRequirement): string {
    if (!requirement.sensitive || !value) {
      return value
    }

    if (value.length <= 8) {
      return '*'.repeat(value.length)
    }

    // Show first 4 and last 4 characters for longer values
    return `${value.slice(0, 4)}${'*'.repeat(value.length - 8)}${value.slice(-4)}`
  }

  /**
   * Merge user-provided values with environment variables
   * Environment variables take precedence over user input
   */
  public static mergeWithEnvironment(
    userValues: Record<string, string>,
    requirements: ApiKeyRequirement[]
  ): Record<string, string> {
    const merged: Record<string, string> = { ...userValues }

    for (const requirement of requirements) {
      // Check if environment variable exists
      const envValue = process.env[requirement.envKey]
      if (envValue) {
        merged[requirement.envKey] = envValue
      }
    }

    return merged
  }

  /**
   * Create initial state for the connector API key management
   */
  public static createInitialState(template: MCPServerOption): ConnectorApiKeyState {
    const requirements = this.detectRequirements(template)
    const values: Record<string, string> = {}
    const validationResults: Record<string, ApiKeyValidationResult> = {}

    // Initialize with environment variables if available
    for (const requirement of requirements) {
      const envValue = process.env[requirement.envKey]
      if (envValue) {
        values[requirement.envKey] = envValue
        validationResults[requirement.envKey] = { isValid: true }
      } else {
        values[requirement.envKey] = ''
        validationResults[requirement.envKey] = { isValid: !requirement.required }
      }
    }

    return {
      requirements,
      values,
      validationResults,
      isSubmitting: false,
    }
  }

  /**
   * Validate all API key values in the current state
   */
  public static validateAllKeys(state: ConnectorApiKeyState): ConnectorApiKeyState {
    const validationResults: Record<string, ApiKeyValidationResult> = {}

    for (const requirement of state.requirements) {
      const value = state.values[requirement.envKey] || ''
      validationResults[requirement.envKey] = this.validateApiKey(requirement, value)
    }

    return {
      ...state,
      validationResults,
    }
  }

  /**
   * Check if all required API keys are valid
   */
  public static areAllKeysValid(state: ConnectorApiKeyState): boolean {
    return state.requirements.every(requirement => {
      const result = state.validationResults[requirement.envKey]
      return result?.isValid === true
    })
  }

  /**
   * Get environment variables string for the connector instance
   */
  public static buildEnvironmentString(
    template: MCPServerOption,
    apiKeyValues: Record<string, string>
  ): string {
    try {
      // Start with existing environment variables
      const envVars = template.env ? this.parseEnvironmentVariables(template.env) : {}

      // Merge with API key values
      const mergedValues = this.mergeWithEnvironment(
        apiKeyValues,
        this.detectRequirements(template)
      )

      // Replace placeholders in environment variables
      for (const [key, value] of Object.entries(envVars)) {
        if (typeof value === 'string') {
          let processedValue = value
          for (const [envKey, envValue] of Object.entries(mergedValues)) {
            if (envValue) {
              processedValue = processedValue.replace(
                new RegExp(`\\$\\{${envKey}\\}`, 'g'),
                envValue
              )
            }
          }
          envVars[key] = processedValue
        }
      }

      // Add any direct environment variable mappings
      for (const [envKey, envValue] of Object.entries(mergedValues)) {
        if (envValue && !envVars[envKey]) {
          envVars[envKey] = envValue
        }
      }

      return JSON.stringify(envVars, null, 2)
    } catch (error) {
      console.error('[ConnectorApiKeyManager] Failed to build environment string:', error)
      return template.env || '{}'
    }
  }
}
