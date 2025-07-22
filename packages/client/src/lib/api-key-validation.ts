import { ApiKeyRequirement, ApiKeyValidationResult } from '../types/connector-api-keys'

export type ServiceType =
  | 'github'
  | 'slack'
  | 'notion'
  | 'brave'
  | 'stripe'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'aws'
  | 'generic'

export interface ValidationContext {
  service: ServiceType
  requirement: ApiKeyRequirement
  value: string
}

export class ApiKeyValidator {
  /**
   * Comprehensive validation for API keys
   */
  static validate(context: ValidationContext): ApiKeyValidationResult {
    const { requirement, value } = context

    // Check if required field is empty
    if (requirement.required && (!value || value.trim() === '')) {
      return {
        isValid: false,
        error: `${requirement.displayName} is required`,
      }
    }

    // If value is empty and not required, it's valid
    if (!value || value.trim() === '') {
      return { isValid: true }
    }

    // Check basic validation pattern if provided
    if (requirement.validation && !requirement.validation.test(value)) {
      return {
        isValid: false,
        error: this.getValidationErrorMessage(context),
      }
    }

    // Perform service-specific validation
    const serviceValidation = this.validateServiceSpecific(context)
    if (!serviceValidation.isValid) {
      return serviceValidation
    }

    return { isValid: true }
  }

  /**
   * Get type-specific error messages
   */
  static getValidationErrorMessage(context: ValidationContext): string {
    const { requirement, service } = context

    switch (requirement.type) {
      case 'api_key':
        return this.getApiKeyErrorMessage(service, requirement.displayName)
      case 'token':
        return this.getTokenErrorMessage(service, requirement.displayName)
      case 'connection_string':
        return `${requirement.displayName} must be a valid connection string`
      case 'file_path':
        return `${requirement.displayName} must be a valid file path`
      case 'directory_path':
        return `${requirement.displayName} must be a valid directory path`
      default:
        return `${requirement.displayName} format is invalid`
    }
  }

  /**
   * Service-specific validation rules
   */
  static validateServiceSpecific(context: ValidationContext): ApiKeyValidationResult {
    const { service, value } = context

    switch (service) {
      case 'github':
        return this.validateGitHub(value, context.requirement)
      case 'slack':
        return this.validateSlack(value, context.requirement)
      case 'notion':
        return this.validateNotion(value, context.requirement)
      case 'brave':
        return this.validateBrave(value, context.requirement)
      case 'stripe':
        return this.validateStripe(value, context.requirement)
      case 'openai':
        return this.validateOpenAI(value, context.requirement)
      case 'anthropic':
        return this.validateAnthropic(value, context.requirement)
      case 'google':
        return this.validateGoogle(value, context.requirement)
      case 'azure':
        return this.validateAzure(value, context.requirement)
      case 'aws':
        return this.validateAWS(value, context.requirement)
      default:
        return { isValid: true } // Generic validation passed basic checks
    }
  }

  // Service-specific validation methods
  private static validateGitHub(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // GitHub Personal Access Tokens start with 'ghp_', 'gho_', 'ghu_', 'ghs_', or 'ghr_'
    if (requirement.envKey.includes('TOKEN')) {
      const githubTokenPattern = /^gh[pous]_[A-Za-z0-9]{36}$/
      if (!githubTokenPattern.test(value)) {
        return {
          isValid: false,
          error:
            'GitHub token must start with ghp_, gho_, ghu_, ghs_, or ghr_ followed by 36 characters',
        }
      }
    }
    return { isValid: true }
  }

  private static validateSlack(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // Slack Bot Token starts with 'xoxb-'
    if (requirement.envKey.includes('BOT_TOKEN')) {
      if (!value.startsWith('xoxb-')) {
        return {
          isValid: false,
          error: 'Slack Bot Token must start with "xoxb-"',
        }
      }
    }
    // Slack App Token starts with 'xapp-'
    else if (requirement.envKey.includes('APP_TOKEN')) {
      if (!value.startsWith('xapp-')) {
        return {
          isValid: false,
          error: 'Slack App Token must start with "xapp-"',
        }
      }
    }
    return { isValid: true }
  }

  private static validateNotion(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // Notion API keys are typically 50 characters long and start with 'secret_'
    if (requirement.type === 'api_key') {
      if (!value.startsWith('secret_')) {
        return {
          isValid: false,
          error: 'Notion API key must start with "secret_"',
        }
      }
      if (value.length !== 50) {
        return {
          isValid: false,
          error: 'Notion API key must be exactly 50 characters long',
        }
      }
    }
    return { isValid: true }
  }

  private static validateBrave(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // Brave Search API keys are typically 40 characters long
    if (requirement.type === 'api_key' && value.length !== 40) {
      return {
        isValid: false,
        error: 'Brave Search API key must be exactly 40 characters long',
      }
    }
    return { isValid: true }
  }

  private static validateStripe(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // Stripe keys have specific prefixes
    if (requirement.envKey.includes('PUBLISHABLE')) {
      if (!value.startsWith('pk_')) {
        return {
          isValid: false,
          error: 'Stripe publishable key must start with "pk_"',
        }
      }
    } else if (requirement.envKey.includes('SECRET')) {
      if (!value.startsWith('sk_')) {
        return {
          isValid: false,
          error: 'Stripe secret key must start with "sk_"',
        }
      }
    }
    return { isValid: true }
  }

  private static validateOpenAI(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // OpenAI API keys start with 'sk-'
    if (requirement.type === 'api_key' && !value.startsWith('sk-')) {
      return {
        isValid: false,
        error: 'OpenAI API key must start with "sk-"',
      }
    }
    return { isValid: true }
  }

  private static validateAnthropic(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // Anthropic API keys start with 'sk-ant-'
    if (requirement.type === 'api_key' && !value.startsWith('sk-ant-')) {
      return {
        isValid: false,
        error: 'Anthropic API key must start with "sk-ant-"',
      }
    }
    return { isValid: true }
  }

  private static validateGoogle(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // Google API keys are typically 39 characters long
    if (requirement.type === 'api_key' && value.length !== 39) {
      return {
        isValid: false,
        error: 'Google API key must be exactly 39 characters long',
      }
    }
    return { isValid: true }
  }

  private static validateAzure(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // Azure keys are typically 32 characters long (hexadecimal)
    if (requirement.type === 'api_key') {
      const azureKeyPattern = /^[a-f0-9]{32}$/i
      if (!azureKeyPattern.test(value)) {
        return {
          isValid: false,
          error: 'Azure API key must be 32 hexadecimal characters',
        }
      }
    }
    return { isValid: true }
  }

  private static validateAWS(
    value: string,
    requirement: ApiKeyRequirement
  ): ApiKeyValidationResult {
    // AWS Access Key ID is 20 characters, Secret Access Key is 40 characters
    if (requirement.envKey.includes('ACCESS_KEY_ID')) {
      if (value.length !== 20) {
        return {
          isValid: false,
          error: 'AWS Access Key ID must be exactly 20 characters long',
        }
      }
    } else if (requirement.envKey.includes('SECRET_ACCESS_KEY')) {
      if (value.length !== 40) {
        return {
          isValid: false,
          error: 'AWS Secret Access Key must be exactly 40 characters long',
        }
      }
    }
    return { isValid: true }
  }

  // Helper methods for error messages
  private static getApiKeyErrorMessage(service: ServiceType, displayName: string): string {
    switch (service) {
      case 'github':
        return `${displayName} must be a valid GitHub token (starts with ghp_, gho_, ghu_, ghs_, or ghr_)`
      case 'slack':
        return `${displayName} must be a valid Slack token (starts with xoxb- or xapp-)`
      case 'notion':
        return `${displayName} must be a valid Notion API key (starts with secret_ and is 50 characters)`
      case 'brave':
        return `${displayName} must be a valid Brave Search API key (40 characters)`
      case 'stripe':
        return `${displayName} must be a valid Stripe key (starts with pk_ or sk_)`
      case 'openai':
        return `${displayName} must be a valid OpenAI API key (starts with sk-)`
      case 'anthropic':
        return `${displayName} must be a valid Anthropic API key (starts with sk-ant-)`
      case 'google':
        return `${displayName} must be a valid Google API key (39 characters)`
      case 'azure':
        return `${displayName} must be a valid Azure API key (32 hexadecimal characters)`
      case 'aws':
        return `${displayName} must be a valid AWS credential`
      default:
        return `${displayName} format is invalid`
    }
  }

  private static getTokenErrorMessage(service: ServiceType, displayName: string): string {
    switch (service) {
      case 'github':
        return `${displayName} must be a valid GitHub token`
      case 'slack':
        return `${displayName} must be a valid Slack token`
      default:
        return `${displayName} must be a valid token`
    }
  }

  /**
   * Batch validate multiple API keys
   */
  static validateBatch(contexts: ValidationContext[]): Record<string, ApiKeyValidationResult> {
    const results: Record<string, ApiKeyValidationResult> = {}

    contexts.forEach(context => {
      results[context.requirement.envKey] = this.validate(context)
    })

    return results
  }

  /**
   * Check if all validations in a batch are valid
   */
  static isAllValid(validationResults: Record<string, ApiKeyValidationResult>): boolean {
    return Object.values(validationResults).every(result => result.isValid)
  }

  /**
   * Get all validation errors from a batch
   */
  static getValidationErrors(validationResults: Record<string, ApiKeyValidationResult>): string[] {
    return Object.values(validationResults)
      .filter(result => !result.isValid)
      .map(result => result.error!)
      .filter(Boolean)
  }
}
