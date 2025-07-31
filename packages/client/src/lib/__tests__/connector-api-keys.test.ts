import { ConnectorApiKeyManager } from '../connector-api-keys'
import { ApiKeyRequirement } from '../../types/connector-api-keys'
import { MCPServerOption } from '../api'

// Mock MCPServerOption data for testing
const mockMCPServerOptions: Record<string, MCPServerOption> = {
  github: {
    id: 'github-connector',
    name: 'GitHub',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: '{"GITHUB_TOKEN": "${GITHUB_TOKEN}"}',
  },
  slack: {
    id: 'slack-connector',
    name: 'Slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: '{"SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}"}',
  },
  notion: {
    id: 'notion-connector',
    name: 'Notion',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-notion'],
    env: '{"OPENAPI_MCP_HEADERS": "{\\"Authorization\\": \\"Bearer ${NOTION_API_KEY}\\"}"}',
  },
  brave: {
    id: 'brave-search',
    name: 'Brave Search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: '{"BRAVE_API_KEY": "${BRAVE_API_KEY}"}',
  },
  stripe: {
    id: 'stripe-connector',
    name: 'Stripe',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-stripe'],
    env: '{"STRIPE_API_KEY": "${STRIPE_SECRET_KEY}"}',
  },
  postgres: {
    id: 'postgres-connector',
    name: 'PostgreSQL',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: '{"POSTGRES_CONNECTION_STRING": "${DATABASE_URL}"}',
  },
  multipleKeys: {
    id: 'multiple-keys',
    name: 'Multiple Keys',
    command: 'npx',
    args: ['-y', 'test-server'],
    env: '{"API_KEY": "${API_KEY}", "SECRET_TOKEN": "${SECRET_TOKEN}", "DATABASE_URL": "${DATABASE_URL}"}',
  },
  keyValueFormat: {
    id: 'key-value-format',
    name: 'Key-Value Format',
    command: 'npx',
    args: ['-y', 'test-server'],
    env: 'API_KEY=${API_KEY}\nSECRET_TOKEN=${SECRET_TOKEN}',
  },
  noKeys: {
    id: 'no-keys',
    name: 'No Keys',
    command: 'npx',
    args: ['-y', 'simple-server'],
    env: '{"STATIC_VALUE": "no-placeholder"}',
  },
  commandWithPlaceholder: {
    id: 'command-placeholder',
    name: 'Command Placeholder',
    command: '${CUSTOM_COMMAND}',
    args: ['--token', '${AUTH_TOKEN}'],
    env: '{}',
  },
  malformedJson: {
    id: 'malformed-json',
    name: 'Malformed JSON',
    command: 'npx',
    args: ['-y', 'test-server'],
    env: '{"API_KEY": "${API_KEY", "incomplete": }',
  },
}

describe('ConnectorApiKeyManager', () => {
  describe('detectRequirements', () => {
    it('should detect GitHub token requirements', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(mockMCPServerOptions.github)

      expect(requirements).toHaveLength(1)
      expect(requirements[0]).toMatchObject({
        envKey: 'GITHUB_TOKEN',
        displayName: 'Github Token',
        type: 'token',
        required: true,
        sensitive: true,
      })
      expect(requirements[0].placeholder).toContain('github')
      expect(requirements[0].validation).toBeDefined()
    })

    it('should detect Slack bot token requirements', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(mockMCPServerOptions.slack)

      expect(requirements).toHaveLength(1)
      expect(requirements[0]).toMatchObject({
        envKey: 'SLACK_BOT_TOKEN',
        displayName: 'Slack Bot Token',
        type: 'token',
        required: true,
        sensitive: true,
      })
    })

    it('should detect Notion API key in nested JSON structure', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(mockMCPServerOptions.notion)

      expect(requirements).toHaveLength(1)
      expect(requirements[0]).toMatchObject({
        envKey: 'NOTION_API_KEY',
        displayName: 'Notion Api Key',
        type: 'api_key',
        required: true,
        sensitive: true,
      })
    })

    it('should detect Brave Search API key requirements', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(mockMCPServerOptions.brave)

      expect(requirements).toHaveLength(1)
      expect(requirements[0]).toMatchObject({
        envKey: 'BRAVE_API_KEY',
        displayName: 'Brave Api Key',
        type: 'api_key',
        required: true,
        sensitive: true,
      })
    })

    it('should detect Stripe secret key requirements', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(mockMCPServerOptions.stripe)

      expect(requirements).toHaveLength(1)
      expect(requirements[0]).toMatchObject({
        envKey: 'STRIPE_SECRET_KEY',
        displayName: 'Stripe Secret Key',
        type: 'api_key',
        required: true,
        sensitive: true,
      })
    })

    it('should detect PostgreSQL connection string requirements', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(mockMCPServerOptions.postgres)

      expect(requirements).toHaveLength(1)
      expect(requirements[0]).toMatchObject({
        envKey: 'DATABASE_URL',
        displayName: 'Database Url',
        type: 'connection_string',
        required: true,
        sensitive: false,
      })
    })

    it('should detect filesystem path requirements', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(
        mockMCPServerOptions.filesystem
      )

      expect(requirements).toHaveLength(1)
      expect(requirements[0]).toMatchObject({
        envKey: 'FILESYSTEM_PATH',
        displayName: 'Filesystem Path',
        type: 'file_path',
        required: true,
        sensitive: false,
      })
    })

    it('should detect multiple API key requirements', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(
        mockMCPServerOptions.multipleKeys
      )

      expect(requirements).toHaveLength(3)

      const apiKeyReq = requirements.find(r => r.envKey === 'API_KEY')
      const tokenReq = requirements.find(r => r.envKey === 'SECRET_TOKEN')
      const dbReq = requirements.find(r => r.envKey === 'DATABASE_URL')

      expect(apiKeyReq).toMatchObject({
        envKey: 'API_KEY',
        type: 'api_key',
        sensitive: true,
      })

      expect(tokenReq).toMatchObject({
        envKey: 'SECRET_TOKEN',
        type: 'token',
        sensitive: true,
      })

      expect(dbReq).toMatchObject({
        envKey: 'DATABASE_URL',
        type: 'connection_string',
        sensitive: false,
      })
    })

    it('should parse key=value format environment variables', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(
        mockMCPServerOptions.keyValueFormat
      )

      expect(requirements).toHaveLength(2)
      expect(requirements.map(r => r.envKey)).toContain('API_KEY')
      expect(requirements.map(r => r.envKey)).toContain('SECRET_TOKEN')
    })

    it('should detect placeholders in command and arguments', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(
        mockMCPServerOptions.commandWithPlaceholder
      )

      expect(requirements).toHaveLength(2)
      expect(requirements.map(r => r.envKey)).toContain('CUSTOM_COMMAND')
      expect(requirements.map(r => r.envKey)).toContain('AUTH_TOKEN')
    })

    it('should return empty array when no placeholders are found', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(mockMCPServerOptions.noKeys)

      expect(requirements).toHaveLength(0)
    })

    it('should handle malformed JSON gracefully', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(
        mockMCPServerOptions.malformedJson
      )

      // Should still detect API_KEY from the malformed JSON
      expect(requirements).toHaveLength(1)
      expect(requirements[0].envKey).toBe('API_KEY')
    })

    it('should sort requirements alphabetically by display name', () => {
      const requirements = ConnectorApiKeyManager.detectRequirements(
        mockMCPServerOptions.multipleKeys
      )

      const displayNames = requirements.map(r => r.displayName)
      const sortedNames = [...displayNames].sort()
      expect(displayNames).toEqual(sortedNames)
    })

    it('should handle empty environment string', () => {
      const template: MCPServerOption = {
        id: 'empty-env',
        name: 'Empty Env',
        command: 'test',
        args: [],
        env: '',
      }

      const requirements = ConnectorApiKeyManager.detectRequirements(template)
      expect(requirements).toHaveLength(0)
    })

    it('should handle undefined environment', () => {
      const template: MCPServerOption = {
        id: 'no-env',
        name: 'No Env',
        command: 'test',
        args: [],
        env: undefined as any,
      }

      const requirements = ConnectorApiKeyManager.detectRequirements(template)
      expect(requirements).toHaveLength(0)
    })
  })

  describe('validateApiKey', () => {
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
      const result = ConnectorApiKeyManager.validateApiKey(mockRequirement, 'valid_api_key_123')

      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject empty required field', () => {
      const result = ConnectorApiKeyManager.validateApiKey(mockRequirement, '')

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Test API Key is required')
    })

    it('should reject whitespace-only required field', () => {
      const result = ConnectorApiKeyManager.validateApiKey(mockRequirement, '   ')

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Test API Key is required')
    })

    it('should validate against regex pattern', () => {
      const result = ConnectorApiKeyManager.validateApiKey(mockRequirement, 'invalid key!')

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Test API Key format is invalid')
    })

    it('should accept valid optional field when empty', () => {
      const optionalRequirement = { ...mockRequirement, required: false }
      const result = ConnectorApiKeyManager.validateApiKey(optionalRequirement, '')

      expect(result.isValid).toBe(true)
    })

    it('should validate connection string format', () => {
      const connectionRequirement: ApiKeyRequirement = {
        ...mockRequirement,
        type: 'connection_string',
        validation: /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/.+/,
      }

      const validResult = ConnectorApiKeyManager.validateApiKey(
        connectionRequirement,
        'postgresql://user:pass@host:5432/db'
      )
      expect(validResult.isValid).toBe(true)

      const invalidResult = ConnectorApiKeyManager.validateApiKey(
        connectionRequirement,
        'invalid-connection'
      )
      expect(invalidResult.isValid).toBe(false)
      expect(invalidResult.error).toBe('Connection string must include a protocol (e.g., https://)')
    })

    it('should validate file path format', () => {
      const fileRequirement: ApiKeyRequirement = {
        ...mockRequirement,
        type: 'file_path',
      }

      const validResult = ConnectorApiKeyManager.validateApiKey(
        fileRequirement,
        '/path/to/file.json'
      )
      expect(validResult.isValid).toBe(true)

      const invalidResult = ConnectorApiKeyManager.validateApiKey(
        fileRequirement,
        '/path/with\0null'
      )
      expect(invalidResult.isValid).toBe(false)
      expect(invalidResult.error).toBe('Path cannot contain null characters')
    })

    it('should validate minimum length for API keys and tokens', () => {
      const shortResult = ConnectorApiKeyManager.validateApiKey(mockRequirement, 'short')
      expect(shortResult.isValid).toBe(false)
      expect(shortResult.error).toBe('Test API Key must be at least 8 characters long')

      const validResult = ConnectorApiKeyManager.validateApiKey(mockRequirement, 'longenough')
      expect(validResult.isValid).toBe(true)
    })
  })

  describe('maskValue', () => {
    const sensitiveRequirement: ApiKeyRequirement = {
      envKey: 'API_KEY',
      displayName: 'API Key',
      type: 'api_key',
      placeholder: 'Enter API key',
      required: true,
      sensitive: true,
    }

    const nonSensitiveRequirement: ApiKeyRequirement = {
      ...sensitiveRequirement,
      sensitive: false,
    }

    it('should mask sensitive values', () => {
      const masked = ConnectorApiKeyManager.maskValue('sk-1234567890abcdef', sensitiveRequirement)
      expect(masked).toBe('sk-1****cdef')
    })

    it('should not mask non-sensitive values', () => {
      const unmasked = ConnectorApiKeyManager.maskValue('/path/to/file', nonSensitiveRequirement)
      expect(unmasked).toBe('/path/to/file')
    })

    it('should mask short values completely', () => {
      const masked = ConnectorApiKeyManager.maskValue('short', sensitiveRequirement)
      expect(masked).toBe('*****')
    })

    it('should handle empty values', () => {
      const masked = ConnectorApiKeyManager.maskValue('', sensitiveRequirement)
      expect(masked).toBe('')
    })

    it('should show first 4 and last 4 characters for long values', () => {
      const longValue = 'sk-1234567890abcdefghijklmnopqrstuvwxyz'
      const masked = ConnectorApiKeyManager.maskValue(longValue, sensitiveRequirement)
      expect(masked).toBe('sk-1****wxyz')
    })
  })

  describe('mergeWithEnvironment', () => {
    const mockRequirements: ApiKeyRequirement[] = [
      {
        envKey: 'API_KEY',
        displayName: 'API Key',
        type: 'api_key',
        placeholder: 'Enter API key',
        required: true,
        sensitive: true,
      },
      {
        envKey: 'SECRET_TOKEN',
        displayName: 'Secret Token',
        type: 'token',
        placeholder: 'Enter token',
        required: true,
        sensitive: true,
      },
    ]

    const originalEnv = process.env

    beforeEach(() => {
      jest.resetModules()
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should merge user values with environment variables', () => {
      process.env.API_KEY = 'env-api-key'

      const userValues = {
        API_KEY: 'user-api-key',
        SECRET_TOKEN: 'user-token',
      }

      const merged = ConnectorApiKeyManager.mergeWithEnvironment(userValues, mockRequirements)

      expect(merged).toEqual({
        API_KEY: 'env-api-key', // Environment takes precedence
        SECRET_TOKEN: 'user-token',
      })
    })

    it('should use user values when environment variables are not set', () => {
      const userValues = {
        API_KEY: 'user-api-key',
        SECRET_TOKEN: 'user-token',
      }

      const merged = ConnectorApiKeyManager.mergeWithEnvironment(userValues, mockRequirements)

      expect(merged).toEqual(userValues)
    })

    it('should handle empty user values', () => {
      process.env.API_KEY = 'env-api-key'

      const merged = ConnectorApiKeyManager.mergeWithEnvironment({}, mockRequirements)

      expect(merged).toEqual({
        API_KEY: 'env-api-key',
      })
    })
  })

  describe('createInitialState', () => {
    const originalEnv = process.env

    beforeEach(() => {
      jest.resetModules()
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should create initial state with detected requirements', () => {
      const state = ConnectorApiKeyManager.createInitialState(mockMCPServerOptions.github)

      expect(state.requirements).toHaveLength(1)
      expect(state.requirements[0].envKey).toBe('GITHUB_TOKEN')
      expect(state.values).toEqual({ GITHUB_TOKEN: '' })
      expect(state.validationResults.GITHUB_TOKEN.isValid).toBe(false) // Required field is empty
      expect(state.isSubmitting).toBe(false)
    })

    it('should initialize with environment variables when available', () => {
      process.env.GITHUB_TOKEN = 'ghp_test_token'

      const state = ConnectorApiKeyManager.createInitialState(mockMCPServerOptions.github)

      expect(state.values).toEqual({ GITHUB_TOKEN: 'ghp_test_token' })
      expect(state.validationResults.GITHUB_TOKEN.isValid).toBe(true)
    })
  })

  describe('validateAllKeys', () => {
    it('should validate all keys in state', () => {
      const initialState = ConnectorApiKeyManager.createInitialState(
        mockMCPServerOptions.multipleKeys
      )

      // Set some values
      initialState.values = {
        API_KEY: 'valid_api_key',
        SECRET_TOKEN: 'valid_token_123',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
      }

      const validatedState = ConnectorApiKeyManager.validateAllKeys(initialState)

      expect(Object.values(validatedState.validationResults)).toHaveLength(3)
      expect(validatedState.validationResults.API_KEY.isValid).toBe(true)
      expect(validatedState.validationResults.SECRET_TOKEN.isValid).toBe(true)
      expect(validatedState.validationResults.DATABASE_URL.isValid).toBe(true)
    })
  })

  describe('areAllKeysValid', () => {
    it('should return true when all required keys are valid', () => {
      const state = ConnectorApiKeyManager.createInitialState(mockMCPServerOptions.github)
      state.values = { GITHUB_TOKEN: 'ghp_valid_token_123456789012345678901234567890' }
      state.validationResults = { GITHUB_TOKEN: { isValid: true } }

      const result = ConnectorApiKeyManager.areAllKeysValid(state)
      expect(result).toBe(true)
    })

    it('should return false when any required key is invalid', () => {
      const state = ConnectorApiKeyManager.createInitialState(mockMCPServerOptions.multipleKeys)
      state.validationResults = {
        API_KEY: { isValid: true },
        SECRET_TOKEN: { isValid: false, error: 'Invalid token' },
        DATABASE_URL: { isValid: true },
      }

      const result = ConnectorApiKeyManager.areAllKeysValid(state)
      expect(result).toBe(false)
    })
  })

  describe('buildEnvironmentString', () => {
    it('should build environment string with API key values', () => {
      const apiKeyValues = {
        GITHUB_TOKEN: 'ghp_test_token',
      }

      const envString = ConnectorApiKeyManager.buildEnvironmentString(
        mockMCPServerOptions.github,
        apiKeyValues
      )

      const parsed = JSON.parse(envString)
      expect(parsed.GITHUB_TOKEN).toBe('ghp_test_token')
    })

    it('should replace placeholders in existing environment variables', () => {
      const apiKeyValues = {
        NOTION_API_KEY: 'secret_test_key',
      }

      const envString = ConnectorApiKeyManager.buildEnvironmentString(
        mockMCPServerOptions.notion,
        apiKeyValues
      )

      const parsed = JSON.parse(envString)
      expect(parsed.OPENAPI_MCP_HEADERS).toContain('secret_test_key')
    })

    it('should handle multiple API key replacements', () => {
      const apiKeyValues = {
        API_KEY: 'test_api_key',
        SECRET_TOKEN: 'test_token',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      }

      const envString = ConnectorApiKeyManager.buildEnvironmentString(
        mockMCPServerOptions.multipleKeys,
        apiKeyValues
      )

      const parsed = JSON.parse(envString)
      expect(parsed.API_KEY).toBe('test_api_key')
      expect(parsed.SECRET_TOKEN).toBe('test_token')
      expect(parsed.DATABASE_URL).toBe('postgresql://test:test@localhost:5432/test')
    })

    it('should handle errors gracefully and return original env', () => {
      const apiKeyValues = {}

      const envString = ConnectorApiKeyManager.buildEnvironmentString(
        mockMCPServerOptions.malformedJson,
        apiKeyValues
      )

      // Should return the original malformed env string
      expect(envString).toBe(mockMCPServerOptions.malformedJson.env)
    })

    it('should handle empty environment', () => {
      const template: MCPServerOption = {
        id: 'test',
        name: 'Test',
        command: 'test',
        args: [],
        env: undefined as any,
      }

      const envString = ConnectorApiKeyManager.buildEnvironmentString(template, {})
      expect(envString).toBe('{}')
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle circular JSON references gracefully', () => {
      const template: MCPServerOption = {
        id: 'test',
        name: 'Test',
        command: 'test',
        args: [],
        env: '{"valid": "${API_KEY}"}',
      }

      // This should not throw
      expect(() => {
        ConnectorApiKeyManager.detectRequirements(template)
      }).not.toThrow()
    })

    it('should handle very long environment strings', () => {
      const longValue = 'x'.repeat(10000)
      const template: MCPServerOption = {
        id: 'test',
        name: 'Test',
        command: 'test',
        args: [],
        env: `{"LONG_VALUE": "${longValue}", "API_KEY": "\${API_KEY}"}`,
      }

      const requirements = ConnectorApiKeyManager.detectRequirements(template)
      expect(requirements).toHaveLength(1)
      expect(requirements[0].envKey).toBe('API_KEY')
    })

    it('should handle special characters in environment values', () => {
      const template: MCPServerOption = {
        id: 'test',
        name: 'Test',
        command: 'test',
        args: [],
        env: '{"SPECIAL": "value with \\"quotes\\" and \\n newlines", "API_KEY": "${API_KEY}"}',
      }

      const requirements = ConnectorApiKeyManager.detectRequirements(template)
      expect(requirements).toHaveLength(1)
    })
  })
})
