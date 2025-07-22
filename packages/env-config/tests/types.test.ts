/**
 * Tests for type definitions and error handling
 */

import { EnvironmentValidationError, ServerEnvironmentConfig, ClientEnvironmentConfig, EnvironmentConfig } from '../src/types';

describe('type definitions and error handling', () => {
  describe('EnvironmentValidationError', () => {
    it('should create error with message and missing variables', () => {
      const missingVars = ['VAR1', 'VAR2'];
      const message = 'Missing required environment variables: VAR1, VAR2';
      
      const error = new EnvironmentValidationError(message, missingVars);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('EnvironmentValidationError');
      expect(error.message).toBe(message);
      expect(error.missingVariables).toEqual(missingVars);
    });

    it('should handle empty missing variables array', () => {
      const error = new EnvironmentValidationError('Test error', []);
      
      expect(error.missingVariables).toEqual([]);
      expect(Array.isArray(error.missingVariables)).toBe(true);
    });

    it('should handle single missing variable', () => {
      const error = new EnvironmentValidationError('Missing OPENAI_API_KEY', ['OPENAI_API_KEY']);
      
      expect(error.missingVariables).toEqual(['OPENAI_API_KEY']);
      expect(error.missingVariables.length).toBe(1);
    });

    it('should be throwable and catchable', () => {
      const error = new EnvironmentValidationError('Test error', ['TEST_VAR']);
      
      expect(() => {
        throw error;
      }).toThrow(EnvironmentValidationError);
      
      try {
        throw error;
      } catch (caught) {
        expect(caught).toBeInstanceOf(EnvironmentValidationError);
        expect((caught as EnvironmentValidationError).missingVariables).toEqual(['TEST_VAR']);
      }
    });

    it('should maintain error stack trace', () => {
      const error = new EnvironmentValidationError('Test error', ['TEST_VAR']);
      
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack).toContain('EnvironmentValidationError');
    });
  });

  describe('type interfaces', () => {
    describe('ServerEnvironmentConfig', () => {
      it('should have all required server properties', () => {
        // This test verifies the interface structure by creating a mock object
        const mockConfig: ServerEnvironmentConfig = {
          PORT: 3000,
          NODE_ENV: 'development',
          LOG_LEVEL: 'info',
          REDEPLOY_SECRET: 'secret',
          DISCORD_BOT_TOKEN: undefined,
          OPEN_WEBUI_BASE_URL: undefined,
          NEO4J_URI: 'bolt://localhost:7687',
          NEO4J_USERNAME: 'neo4j',
          NEO4J_PASSWORD: 'password',
          NEO4J_DATABASE: 'neo4j',
          OPENAI_API_KEY: undefined,
          ANTHROPIC_API_KEY: undefined,
          DEFAULT_LLM_PROVIDER: 'openai',
          DEFAULT_CHAT_MODEL: 'gpt-4',
          DEFAULT_EMBEDDING_MODEL: 'text-embedding-3-small',
          DEFAULT_MODEL_ID: 'default-openai-gpt4',
          DEFAULT_TEMPERATURE: 0.7,
          DEFAULT_MAX_TOKENS: 4096,
          FAISS_INDEX_PATH: './data/faiss_index',
          KINDE_CLIENT_ID: 'client-id',
          KINDE_CLIENT_SECRET: 'client-secret',
          KINDE_ISSUER_URL: 'https://issuer.com',
          KINDE_SITE_URL: 'http://localhost:3000',
          KINDE_POST_LOGIN_REDIRECT_URL: 'http://localhost:3000/callback',
          KINDE_POST_LOGOUT_REDIRECT_URL: 'http://localhost:3000/logout',
          KINDE_DEBUG_MODE: false
        };
        
        // If this compiles, it means all required properties are present
        expect(mockConfig).toBeDefined();
        expect(typeof mockConfig.PORT).toBe('number');
        expect(typeof mockConfig.NODE_ENV).toBe('string');
        expect(typeof mockConfig.DEFAULT_TEMPERATURE).toBe('number');
        expect(typeof mockConfig.DEFAULT_MAX_TOKENS).toBe('number');
        expect(typeof mockConfig.KINDE_DEBUG_MODE).toBe('boolean');
      });

      it('should allow optional properties to be undefined', () => {
        const mockConfig: Partial<ServerEnvironmentConfig> = {
          PORT: 3000,
          NODE_ENV: 'development',
          DISCORD_BOT_TOKEN: undefined,
          OPENAI_API_KEY: undefined,
          ANTHROPIC_API_KEY: undefined,
          KINDE_DEBUG_MODE: undefined
        };
        
        expect(mockConfig.DISCORD_BOT_TOKEN).toBeUndefined();
        expect(mockConfig.OPENAI_API_KEY).toBeUndefined();
        expect(mockConfig.ANTHROPIC_API_KEY).toBeUndefined();
      });

      it('should enforce DEFAULT_LLM_PROVIDER union type', () => {
        // This tests the union type at compile time
        const validProviders: ServerEnvironmentConfig['DEFAULT_LLM_PROVIDER'][] = [
          'openai',
          'anthropic',
          ''
        ];
        
        expect(validProviders).toContain('openai');
        expect(validProviders).toContain('anthropic');
        expect(validProviders).toContain('');
      });
    });

    describe('ClientEnvironmentConfig', () => {
      it('should have all required client properties', () => {
        const mockConfig: ClientEnvironmentConfig = {
          NEXT_PUBLIC_API_URL: undefined
        };
        
        expect(mockConfig).toBeDefined();
        expect('NEXT_PUBLIC_API_URL' in mockConfig).toBe(true);
      });

      it('should allow NEXT_PUBLIC_API_URL to be string or undefined', () => {
        const configWithUrl: ClientEnvironmentConfig = {
          NEXT_PUBLIC_API_URL: 'https://api.example.com'
        };
        
        const configWithoutUrl: ClientEnvironmentConfig = {
          NEXT_PUBLIC_API_URL: undefined
        };
        
        expect(typeof configWithUrl.NEXT_PUBLIC_API_URL).toBe('string');
        expect(configWithoutUrl.NEXT_PUBLIC_API_URL).toBeUndefined();
      });
    });

    describe('EnvironmentConfig', () => {
      it('should extend both ServerEnvironmentConfig and ClientEnvironmentConfig', () => {
        const mockConfig: EnvironmentConfig = {
          // Server properties
          PORT: 3000,
          NODE_ENV: 'development',
          LOG_LEVEL: 'info',
          REDEPLOY_SECRET: 'secret',
          DISCORD_BOT_TOKEN: undefined,
          OPEN_WEBUI_BASE_URL: undefined,
          NEO4J_URI: 'bolt://localhost:7687',
          NEO4J_USERNAME: 'neo4j',
          NEO4J_PASSWORD: 'password',
          NEO4J_DATABASE: 'neo4j',
          OPENAI_API_KEY: undefined,
          ANTHROPIC_API_KEY: undefined,
          DEFAULT_LLM_PROVIDER: 'openai',
          DEFAULT_CHAT_MODEL: 'gpt-4',
          DEFAULT_EMBEDDING_MODEL: 'text-embedding-3-small',
          DEFAULT_MODEL_ID: 'default-openai-gpt4',
          DEFAULT_TEMPERATURE: 0.7,
          DEFAULT_MAX_TOKENS: 4096,
          FAISS_INDEX_PATH: './data/faiss_index',
          KINDE_CLIENT_ID: 'client-id',
          KINDE_CLIENT_SECRET: 'client-secret',
          KINDE_ISSUER_URL: 'https://issuer.com',
          KINDE_SITE_URL: 'http://localhost:3000',
          KINDE_POST_LOGIN_REDIRECT_URL: 'http://localhost:3000/callback',
          KINDE_POST_LOGOUT_REDIRECT_URL: 'http://localhost:3000/logout',
          KINDE_DEBUG_MODE: false,
          // Client properties
          NEXT_PUBLIC_API_URL: undefined
        };
        
        expect(mockConfig).toBeDefined();
        expect(typeof mockConfig.PORT).toBe('number'); // Server property
        expect('NEXT_PUBLIC_API_URL' in mockConfig).toBe(true); // Client property
      });
    });
  });

  describe('type safety', () => {
    it('should enforce numeric types', () => {
      // These should compile successfully
      const port: ServerEnvironmentConfig['PORT'] = 3000;
      const temp: ServerEnvironmentConfig['DEFAULT_TEMPERATURE'] = 0.7;
      const tokens: ServerEnvironmentConfig['DEFAULT_MAX_TOKENS'] = 4096;
      
      expect(typeof port).toBe('number');
      expect(typeof temp).toBe('number');
      expect(typeof tokens).toBe('number');
    });

    it('should enforce boolean types', () => {
      const debugMode: ServerEnvironmentConfig['KINDE_DEBUG_MODE'] = true;
      const debugModeOptional: ServerEnvironmentConfig['KINDE_DEBUG_MODE'] = undefined;
      
      expect(typeof debugMode === 'boolean' || debugMode === undefined).toBe(true);
      expect(typeof debugModeOptional === 'boolean' || debugModeOptional === undefined).toBe(true);
    });

    it('should enforce string types', () => {
      const nodeEnv: ServerEnvironmentConfig['NODE_ENV'] = 'production';
      const uri: ServerEnvironmentConfig['NEO4J_URI'] = 'bolt://localhost:7687';
      
      expect(typeof nodeEnv).toBe('string');
      expect(typeof uri).toBe('string');
    });
  });
});