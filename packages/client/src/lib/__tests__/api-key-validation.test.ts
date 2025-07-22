import { ApiKeyValidator, ServiceType, ValidationContext } from '../api-key-validation'
import { ApiKeyRequirement } from '../../types/connector-api-keys'

describe('ApiKeyValidator', () => {
  describe('validate', () => {
    const mockRequirement: ApiKeyRequirement = {
      envKey: 'TEST_API_KEY',
      displayName: 'Test API Key',
      type: 'api_key',
      placeholder: 'Enter your test API key',
      required: true,
      sensitive: true,
      validation: /^[a-zA-Z0-9_-]{8,}$/,
    }

    it('should validate required field with valid value', () => {
      const context: ValidationContext = {
        service: 'generic',
        requirement: mockRequirement,
        value: 'valid_api_key_123',
      }

      const result = ApiKeyValidator.validate(context)

      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject empty required field', () => {
      const context: ValidationContext = {
        service: 'generic',
        requirement: mockRequirement,
        value: '',
      }

      const result = ApiKeyValidator.validate(context)

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Test API Key is required')
    })

    it('should reject whitespace-only required field', () => {
      const context: ValidationContext = {
        service: 'generic',
        requirement: mockRequirement,
        value: '   ',
      }

      const result = ApiKeyValidator.validate(context)

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Test API Key is required')
    })

    it('should accept empty optional field', () => {
      const optionalRequirement = { ...mockRequirement, required: false }
      const context: ValidationContext = {
        service: 'generic',
        requirement: optionalRequirement,
        value: '',
      }

      const result = ApiKeyValidator.validate(context)

      expect(result.isValid).toBe(true)
    })

    it('should validate against regex pattern', () => {
      const context: ValidationContext = {
        service: 'generic',
        requirement: mockRequirement,
        value: 'invalid key!',
      }

      const result = ApiKeyValidator.validate(context)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Test API Key')
    })

    it('should perform service-specific validation', () => {
      const githubRequirement: ApiKeyRequirement = {
        envKey: 'GITHUB_TOKEN',
        displayName: 'GitHub Token',
        type: 'token',
        placeholder: 'Enter GitHub token',
        required: true,
        sensitive: true,
      }

      const context: ValidationContext = {
        service: 'github',
        requirement: githubRequirement,
        value: 'invalid_github_token',
      }

      const result = ApiKeyValidator.validate(context)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('GitHub token')
    })
  })

  describe('getValidationErrorMessage', () => {
    it('should return appropriate error message for api_key type', () => {
      const context: ValidationContext = {
        service: 'github',
        requirement: {
          envKey: 'GITHUB_API_KEY',
          displayName: 'GitHub API Key',
          type: 'api_key',
          placeholder: 'Enter GitHub API key',
          required: true,
          sensitive: true,
        },
        value: 'test',
      }

      const message = ApiKeyValidator.getValidationErrorMessage(context)

      expect(message).toContain('GitHub API Key')
      expect(message).toContain('GitHub token')
    })

    it('should return appropriate error message for token type', () => {
      const context: ValidationContext = {
        service: 'slack',
        requirement: {
          envKey: 'SLACK_TOKEN',
          displayName: 'Slack Token',
          type: 'token',
          placeholder: 'Enter Slack token',
          required: true,
          sensitive: true,
        },
        value: 'test',
      }

      const message = ApiKeyValidator.getValidationErrorMessage(context)

      expect(message).toContain('Slack Token')
    })

    it('should return appropriate error message for connection_string type', () => {
      const context: ValidationContext = {
        service: 'generic',
        requirement: {
          envKey: 'DATABASE_URL',
          displayName: 'Database URL',
          type: 'connection_string',
          placeholder: 'Enter database URL',
          required: true,
          sensitive: false,
        },
        value: 'test',
      }

      const message = ApiKeyValidator.getValidationErrorMessage(context)

      expect(message).toBe('Database URL must be a valid connection string')
    })

    it('should return appropriate error message for file_path type', () => {
      const context: ValidationContext = {
        service: 'generic',
        requirement: {
          envKey: 'CREDENTIALS_FILE',
          displayName: 'Credentials File',
          type: 'file_path',
          placeholder: 'Enter file path',
          required: true,
          sensitive: false,
        },
        value: 'test',
      }

      const message = ApiKeyValidator.getValidationErrorMessage(context)

      expect(message).toBe('Credentials File must be a valid file path')
    })

    it('should return appropriate error message for directory_path type', () => {
      const context: ValidationContext = {
        service: 'generic',
        requirement: {
          envKey: 'DATA_DIR',
          displayName: 'Data Directory',
          type: 'directory_path',
          placeholder: 'Enter directory path',
          required: true,
          sensitive: false,
        },
        value: 'test',
      }

      const message = ApiKeyValidator.getValidationErrorMessage(context)

      expect(message).toBe('Data Directory must be a valid directory path')
    })
  })

  describe('validateServiceSpecific', () => {
    describe('GitHub validation', () => {
      it('should validate GitHub personal access token format', () => {
        const context: ValidationContext = {
          service: 'github',
          requirement: {
            envKey: 'GITHUB_TOKEN',
            displayName: 'GitHub Token',
            type: 'token',
            placeholder: 'Enter GitHub token',
            required: true,
            sensitive: true,
          },
          value: 'ghp_1234567890123456789012345678901234567890',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(true)
      })

      it('should reject invalid GitHub token format', () => {
        const context: ValidationContext = {
          service: 'github',
          requirement: {
            envKey: 'GITHUB_TOKEN',
            displayName: 'GitHub Token',
            type: 'token',
            placeholder: 'Enter GitHub token',
            required: true,
            sensitive: true,
          },
          value: 'invalid_github_token',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(false)
        expect(result.error).toContain('GitHub token must start with')
      })

      it('should validate different GitHub token prefixes', () => {
        const validTokens = [
          'ghp_1234567890123456789012345678901234567890',
          'gho_1234567890123456789012345678901234567890',
          'ghu_1234567890123456789012345678901234567890',
          'ghs_1234567890123456789012345678901234567890',
        ]

        validTokens.forEach(token => {
          const context: ValidationContext = {
            service: 'github',
            requirement: {
              envKey: 'GITHUB_TOKEN',
              displayName: 'GitHub Token',
              type: 'token',
              placeholder: 'Enter GitHub token',
              required: true,
              sensitive: true,
            },
            value: token,
          }

          const result = ApiKeyValidator.validateServiceSpecific(context)
          expect(result.isValid).toBe(true)
        })
      })
    })

    describe('Slack validation', () => {
      it('should validate Slack bot token format', () => {
        const context: ValidationContext = {
          service: 'slack',
          requirement: {
            envKey: 'SLACK_BOT_TOKEN',
            displayName: 'Slack Bot Token',
            type: 'token',
            placeholder: 'Enter Slack bot token',
            required: true,
            sensitive: true,
          },
          value: 'xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(true)
      })

      it('should validate Slack app token format', () => {
        const context: ValidationContext = {
          service: 'slack',
          requirement: {
            envKey: 'SLACK_APP_TOKEN',
            displayName: 'Slack App Token',
            type: 'token',
            placeholder: 'Enter Slack app token',
            required: true,
            sensitive: true,
          },
          value: 'xapp-1-A1234567890-1234567890123-abcdefghijklmnopqrstuvwxyz123456',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(true)
      })

      it('should reject invalid Slack bot token format', () => {
        const context: ValidationContext = {
          service: 'slack',
          requirement: {
            envKey: 'SLACK_BOT_TOKEN',
            displayName: 'Slack Bot Token',
            type: 'token',
            placeholder: 'Enter Slack bot token',
            required: true,
            sensitive: true,
          },
          value: 'invalid_slack_token',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(false)
        expect(result.error).toBe('Slack Bot Token must start with "xoxb-"')
      })

      it('should reject invalid Slack app token format', () => {
        const context: ValidationContext = {
          service: 'slack',
          requirement: {
            envKey: 'SLACK_APP_TOKEN',
            displayName: 'Slack App Token',
            type: 'token',
            placeholder: 'Enter Slack app token',
            required: true,
            sensitive: true,
          },
          value: 'invalid_slack_app_token',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(false)
        expect(result.error).toBe('Slack App Token must start with "xapp-"')
      })
    })

    describe('Notion validation', () => {
      it('should validate Notion API key format', () => {
        const context: ValidationContext = {
          service: 'notion',
          requirement: {
            envKey: 'NOTION_API_KEY',
            displayName: 'Notion API Key',
            type: 'api_key',
            placeholder: 'Enter Notion API key',
            required: true,
            sensitive: true,
          },
          value: 'secret_1234567890123456789012345678901234567890123456',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(true)
      })

      it('should reject Notion API key without secret_ prefix', () => {
        const context: ValidationContext = {
          service: 'notion',
          requirement: {
            envKey: 'NOTION_API_KEY',
            displayName: 'Notion API Key',
            type: 'api_key',
            placeholder: 'Enter Notion API key',
            required: true,
            sensitive: true,
          },
          value: '1234567890123456789012345678901234567890123456789',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(false)
        expect(result.error).toBe('Notion API key must start with "secret_"')
      })

      it('should reject Notion API key with wrong length', () => {
        const context: ValidationContext = {
          service: 'notion',
          requirement: {
            envKey: 'NOTION_API_KEY',
            displayName: 'Notion API Key',
            type: 'api_key',
            placeholder: 'Enter Notion API key',
            required: true,
            sensitive: true,
          },
          value: 'secret_123456789012345678901234567890',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(false)
        expect(result.error).toBe('Notion API key must be exactly 50 characters long')
      })
    })

    describe('OpenAI validation', () => {
      it('should validate OpenAI API key format', () => {
        const context: ValidationContext = {
          service: 'openai',
          requirement: {
            envKey: 'OPENAI_API_KEY',
            displayName: 'OpenAI API Key',
            type: 'api_key',
            placeholder: 'Enter OpenAI API key',
            required: true,
            sensitive: true,
          },
          value: 'sk-1234567890123456789012345678901234567890123456789',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(true)
      })

      it('should reject OpenAI API key without sk- prefix', () => {
        const context: ValidationContext = {
          service: 'openai',
          requirement: {
            envKey: 'OPENAI_API_KEY',
            displayName: 'OpenAI API Key',
            type: 'api_key',
            placeholder: 'Enter OpenAI API key',
            required: true,
            sensitive: true,
          },
          value: '1234567890123456789012345678901234567890123456789',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(false)
        expect(result.error).toBe('OpenAI API key must start with "sk-"')
      })
    })

    describe('Generic service validation', () => {
      it('should return valid for generic service', () => {
        const context: ValidationContext = {
          service: 'generic',
          requirement: {
            envKey: 'GENERIC_API_KEY',
            displayName: 'Generic API Key',
            type: 'api_key',
            placeholder: 'Enter API key',
            required: true,
            sensitive: true,
          },
          value: 'any_valid_key',
        }

        const result = ApiKeyValidator.validateServiceSpecific(context)

        expect(result.isValid).toBe(true)
      })
    })
  })

  describe('validateBatch', () => {
    it('should validate multiple contexts', () => {
      const contexts: ValidationContext[] = [
        {
          service: 'github',
          requirement: {
            envKey: 'GITHUB_TOKEN',
            displayName: 'GitHub Token',
            type: 'token',
            placeholder: 'Enter GitHub token',
            required: true,
            sensitive: true,
          },
          value: 'ghp_1234567890123456789012345678901234567890',
        },
        {
          service: 'slack',
          requirement: {
            envKey: 'SLACK_BOT_TOKEN',
            displayName: 'Slack Bot Token',
            type: 'token',
            placeholder: 'Enter Slack bot token',
            required: true,
            sensitive: true,
          },
          value: 'xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx',
        },
        {
          service: 'openai',
          requirement: {
            envKey: 'OPENAI_API_KEY',
            displayName: 'OpenAI API Key',
            type: 'api_key',
            placeholder: 'Enter OpenAI API key',
            required: true,
            sensitive: true,
          },
          value: 'invalid_key',
        },
      ]

      const results = ApiKeyValidator.validateBatch(contexts)

      expect(Object.keys(results)).toHaveLength(3)
      expect(results['GITHUB_TOKEN'].isValid).toBe(true)
      expect(results['SLACK_BOT_TOKEN'].isValid).toBe(true)
      expect(results['OPENAI_API_KEY'].isValid).toBe(false)
      expect(results['OPENAI_API_KEY'].error).toContain('OpenAI API key must start with "sk-"')
    })

    it('should handle empty contexts array', () => {
      const results = ApiKeyValidator.validateBatch([])

      expect(Object.keys(results)).toHaveLength(0)
    })
  })

  describe('isAllValid', () => {
    it('should return true when all validations are valid', () => {
      const validationResults = {
        GITHUB_TOKEN: { isValid: true },
        SLACK_BOT_TOKEN: { isValid: true },
        OPENAI_API_KEY: { isValid: true },
      }

      const result = ApiKeyValidator.isAllValid(validationResults)

      expect(result).toBe(true)
    })

    it('should return false when any validation is invalid', () => {
      const validationResults = {
        GITHUB_TOKEN: { isValid: true },
        SLACK_BOT_TOKEN: { isValid: false, error: 'Invalid token' },
        OPENAI_API_KEY: { isValid: true },
      }

      const result = ApiKeyValidator.isAllValid(validationResults)

      expect(result).toBe(false)
    })

    it('should return true for empty validation results', () => {
      const result = ApiKeyValidator.isAllValid({})

      expect(result).toBe(true)
    })
  })

  describe('getValidationErrors', () => {
    it('should return all error messages', () => {
      const validationResults = {
        GITHUB_TOKEN: { isValid: true },
        SLACK_BOT_TOKEN: { isValid: false, error: 'Invalid Slack token' },
        OPENAI_API_KEY: { isValid: false, error: 'Invalid OpenAI key' },
        NOTION_API_KEY: { isValid: true },
      }

      const errors = ApiKeyValidator.getValidationErrors(validationResults)

      expect(errors).toHaveLength(2)
      expect(errors).toContain('Invalid Slack token')
      expect(errors).toContain('Invalid OpenAI key')
    })

    it('should return empty array when all validations are valid', () => {
      const validationResults = {
        GITHUB_TOKEN: { isValid: true },
        SLACK_BOT_TOKEN: { isValid: true },
        OPENAI_API_KEY: { isValid: true },
      }

      const errors = ApiKeyValidator.getValidationErrors(validationResults)

      expect(errors).toHaveLength(0)
    })

    it('should handle empty validation results', () => {
      const errors = ApiKeyValidator.getValidationErrors({})

      expect(errors).toHaveLength(0)
    })

    it('should filter out undefined errors', () => {
      const validationResults = {
        GITHUB_TOKEN: { isValid: false },
        SLACK_BOT_TOKEN: { isValid: false, error: 'Valid error message' },
      }

      const errors = ApiKeyValidator.getValidationErrors(validationResults)

      expect(errors).toHaveLength(1)
      expect(errors).toContain('Valid error message')
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle undefined service type gracefully', () => {
      const context: ValidationContext = {
        service: undefined as any,
        requirement: {
          envKey: 'TEST_API_KEY',
          displayName: 'Test API Key',
          type: 'api_key',
          placeholder: 'Enter API key',
          required: true,
          sensitive: true,
        },
        value: 'test_value',
      }

      const result = ApiKeyValidator.validateServiceSpecific(context)

      expect(result.isValid).toBe(true)
    })

    it('should handle null values gracefully', () => {
      const context: ValidationContext = {
        service: 'generic',
        requirement: {
          envKey: 'TEST_API_KEY',
          displayName: 'Test API Key',
          type: 'api_key',
          placeholder: 'Enter API key',
          required: true,
          sensitive: true,
        },
        value: null as any,
      }

      const result = ApiKeyValidator.validate(context)

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Test API Key is required')
    })

    it('should handle very long values', () => {
      const longValue = 'a'.repeat(10000)
      const context: ValidationContext = {
        service: 'generic',
        requirement: {
          envKey: 'TEST_API_KEY',
          displayName: 'Test API Key',
          type: 'api_key',
          placeholder: 'Enter API key',
          required: true,
          sensitive: true,
          validation: /^[a-zA-Z0-9_-]{8,}$/,
        },
        value: longValue,
      }

      const result = ApiKeyValidator.validate(context)

      expect(result.isValid).toBe(true)
    })

    it('should handle special characters in service names', () => {
      const context: ValidationContext = {
        service: 'custom-service-123' as ServiceType,
        requirement: {
          envKey: 'CUSTOM_API_KEY',
          displayName: 'Custom API Key',
          type: 'api_key',
          placeholder: 'Enter custom API key',
          required: true,
          sensitive: true,
        },
        value: 'valid_key_123',
      }

      const result = ApiKeyValidator.validateServiceSpecific(context)

      expect(result.isValid).toBe(true)
    })
  })
})
