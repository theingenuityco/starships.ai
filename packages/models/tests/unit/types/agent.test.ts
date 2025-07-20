import { Agent } from '@starships/protocol';

describe('Agent Entity Schema Tests', () => {
  describe('Schema Validation', () => {
    it('should validate Agent has required fields with correct types', () => {
      const validAgent: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test', 'helper'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      // All required fields should be present
      expect(validAgent.id).toBeDefined();
      expect(validAgent.name).toBeDefined();
      expect(validAgent.model).toBeDefined();
      expect(validAgent.starshipId).toBeDefined();
      expect(validAgent.authorId).toBeDefined();
      expect(validAgent.category).toBeDefined();
      expect(validAgent.tags).toBeDefined();
      expect(validAgent.isPublic).toBeDefined();
      expect(validAgent.version).toBeDefined();
      expect(validAgent.usageCount).toBeDefined();
      expect(validAgent.createdAt).toBeDefined();
      expect(validAgent.updatedAt).toBeDefined();

      // Type validation
      expect(typeof validAgent.id).toBe('string');
      expect(typeof validAgent.name).toBe('string');
      expect(typeof validAgent.model).toBe('string');
      expect(typeof validAgent.starshipId).toBe('string');
      expect(typeof validAgent.authorId).toBe('string');
      expect(typeof validAgent.category).toBe('string');
      expect(Array.isArray(validAgent.tags)).toBe(true);
      expect(typeof validAgent.isPublic).toBe('boolean');
      expect(typeof validAgent.version).toBe('string');
      expect(typeof validAgent.usageCount).toBe('number');
      expect(typeof validAgent.createdAt).toBe('string');
      expect(typeof validAgent.updatedAt).toBe('string');
    });

    it('should validate new required starshipId field', () => {
      const agent: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-456', // NEW REQUIRED FIELD
        authorId: 'user-123',
        category: 'coding',
        tags: ['development'],
        isPublic: false,
        version: '1.0.0',
        usageCount: 5,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      expect(agent.starshipId).toBeDefined();
      expect(typeof agent.starshipId).toBe('string');
      expect(agent.starshipId.length).toBeGreaterThan(0);
    });

    it('should validate category enum values', () => {
      const categories: Agent['category'][] = ['general', 'coding', 'creative', 'analysis', 'support'];
      
      categories.forEach(category => {
        const agent: Agent = {
          id: 'test-agent-1',
          name: 'Test Agent',
          model: 'gpt-4',
          starshipId: 'starship-123',
          authorId: 'user-123',
          category,
          tags: ['test'],
          isPublic: true,
          version: '1.0.0',
          usageCount: 0,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z'
        };

        expect(['general', 'coding', 'creative', 'analysis', 'support']).toContain(agent.category);
      });
    });

    it('should validate tags array handling', () => {
      // Empty tags array
      const agentWithEmptyTags: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: [], // Empty array should be valid
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      // Multiple tags
      const agentWithMultipleTags: Agent = {
        id: 'test-agent-2',
        name: 'Test Agent 2',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'coding',
        tags: ['javascript', 'react', 'frontend', 'development'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      expect(Array.isArray(agentWithEmptyTags.tags)).toBe(true);
      expect(agentWithEmptyTags.tags.length).toBe(0);

      expect(Array.isArray(agentWithMultipleTags.tags)).toBe(true);
      expect(agentWithMultipleTags.tags.length).toBe(4);
      expect(agentWithMultipleTags.tags.every(tag => typeof tag === 'string')).toBe(true);
    });

    it('should validate boolean fields', () => {
      const publicAgent: Agent = {
        id: 'test-agent-1',
        name: 'Public Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['public'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      const privateAgent: Agent = {
        id: 'test-agent-2',
        name: 'Private Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['private'],
        isPublic: false,
        version: '1.0.0',
        usageCount: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      expect(typeof publicAgent.isPublic).toBe('boolean');
      expect(publicAgent.isPublic).toBe(true);

      expect(typeof privateAgent.isPublic).toBe('boolean');
      expect(privateAgent.isPublic).toBe(false);
    });

    it('should validate numeric fields', () => {
      const agent: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 42,
        rating: 4.5,
        temperature: 0.7,
        maxTokens: 1000,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      expect(typeof agent.usageCount).toBe('number');
      expect(agent.usageCount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(agent.usageCount)).toBe(true);

      if (agent.rating !== undefined) {
        expect(typeof agent.rating).toBe('number');
        expect(agent.rating).toBeGreaterThanOrEqual(0);
        expect(agent.rating).toBeLessThanOrEqual(5);
      }

      if (agent.temperature !== undefined) {
        expect(typeof agent.temperature).toBe('number');
        expect(agent.temperature).toBeGreaterThanOrEqual(0);
        expect(agent.temperature).toBeLessThanOrEqual(2);
      }

      if (agent.maxTokens !== undefined) {
        expect(typeof agent.maxTokens).toBe('number');
        expect(agent.maxTokens).toBeGreaterThan(0);
        expect(Number.isInteger(agent.maxTokens)).toBe(true);
      }
    });

    it('should validate optional fields are properly typed', () => {
      const agentWithOptionals: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        systemPrompt: 'You are a helpful assistant.',
        description: 'A test agent for validation',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        rating: 4.2,
        temperature: 0.8,
        maxTokens: 2000,
        customInstructions: 'Be concise and helpful.',
        allowedStarshipClasses: ['scout', 'cruiser'],
        requiredPermissions: ['read', 'write'],
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      // Optional string fields
      if (agentWithOptionals.systemPrompt) {
        expect(typeof agentWithOptionals.systemPrompt).toBe('string');
      }
      if (agentWithOptionals.description) {
        expect(typeof agentWithOptionals.description).toBe('string');
      }
      if (agentWithOptionals.customInstructions) {
        expect(typeof agentWithOptionals.customInstructions).toBe('string');
      }

      // Optional array fields
      if (agentWithOptionals.allowedStarshipClasses) {
        expect(Array.isArray(agentWithOptionals.allowedStarshipClasses)).toBe(true);
        expect(agentWithOptionals.allowedStarshipClasses.every(
          cls => ['scout', 'cruiser'].includes(cls)
        )).toBe(true);
      }
      if (agentWithOptionals.requiredPermissions) {
        expect(Array.isArray(agentWithOptionals.requiredPermissions)).toBe(true);
        expect(agentWithOptionals.requiredPermissions.every(
          perm => typeof perm === 'string'
        )).toBe(true);
      }
    });
  });

  describe('Field Constraints', () => {
    it('should validate timestamps are in ISO format', () => {
      const agent: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      // Validate ISO 8601 format
      expect(() => new Date(agent.createdAt).toISOString()).not.toThrow();
      expect(() => new Date(agent.updatedAt).toISOString()).not.toThrow();
      
      // Validate actual ISO format
      expect(agent.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(agent.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should validate foreign key relationships', () => {
      const agent: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123', // Foreign key to Starship
        authorId: 'user-456', // Foreign key to User
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      // starshipId should be a valid string (foreign key)
      expect(agent.starshipId).toBeDefined();
      expect(typeof agent.starshipId).toBe('string');
      expect(agent.starshipId.length).toBeGreaterThan(0);

      // authorId should be a valid string (foreign key)
      expect(agent.authorId).toBeDefined();
      expect(typeof agent.authorId).toBe('string');
      expect(agent.authorId.length).toBeGreaterThan(0);
    });

    it('should validate version string format', () => {
      const agents = [
        { version: '1.0.0' },
        { version: '2.1.3' },
        { version: '0.0.1' },
        { version: '10.2.15' }
      ].map(({ version }) => ({
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general' as const,
        tags: ['test'],
        isPublic: true,
        version,
        usageCount: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      }));

      agents.forEach(agent => {
        expect(typeof agent.version).toBe('string');
        // Basic semver pattern validation
        expect(agent.version).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });
  });

  describe('Data Integrity', () => {
    it('should validate usageCount is non-negative integer', () => {
      const agent: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 25, // Should be non-negative integer
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      expect(agent.usageCount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(agent.usageCount)).toBe(true);
    });

    it('should validate rating is within valid range', () => {
      const agentWithRating: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        rating: 3.8,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      if (agentWithRating.rating !== undefined) {
        expect(agentWithRating.rating).toBeGreaterThanOrEqual(0);
        expect(agentWithRating.rating).toBeLessThanOrEqual(5);
      }
    });

    it('should validate temperature is within valid range', () => {
      const agentWithTemperature: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        temperature: 0.7,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      if (agentWithTemperature.temperature !== undefined) {
        expect(agentWithTemperature.temperature).toBeGreaterThanOrEqual(0);
        expect(agentWithTemperature.temperature).toBeLessThanOrEqual(2);
      }
    });

    it('should validate maxTokens is positive integer when defined', () => {
      const agentWithMaxTokens: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        maxTokens: 2048,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      if (agentWithMaxTokens.maxTokens !== undefined) {
        expect(agentWithMaxTokens.maxTokens).toBeGreaterThan(0);
        expect(Number.isInteger(agentWithMaxTokens.maxTokens)).toBe(true);
      }
    });

    it('should validate updatedAt is same or after createdAt', () => {
      const createdTime = '2023-01-01T00:00:00.000Z';
      const updatedTime = '2023-01-01T01:00:00.000Z'; // 1 hour later

      const agent: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        createdAt: createdTime,
        updatedAt: updatedTime
      };

      expect(new Date(agent.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(agent.createdAt).getTime()
      );
    });

    it('should validate allowedStarshipClasses contains only valid values', () => {
      const agentWithStarshipRestrictions: Agent = {
        id: 'test-agent-1',
        name: 'Test Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: ['test'],
        isPublic: true,
        version: '1.0.0',
        usageCount: 0,
        allowedStarshipClasses: ['scout', 'cruiser'],
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      if (agentWithStarshipRestrictions.allowedStarshipClasses) {
        expect(Array.isArray(agentWithStarshipRestrictions.allowedStarshipClasses)).toBe(true);
        agentWithStarshipRestrictions.allowedStarshipClasses.forEach(cls => {
          expect(['scout', 'cruiser']).toContain(cls);
        });
      }
    });

    it('should validate all category enum values are supported', () => {
      const validCategories: Agent['category'][] = ['general', 'coding', 'creative', 'analysis', 'support'];
      
      validCategories.forEach(category => {
        const agent: Agent = {
          id: `test-agent-${category}`,
          name: `${category} Agent`,
          model: 'gpt-4',
          starshipId: 'starship-123',
          authorId: 'user-123',
          category,
          tags: [category],
          isPublic: true,
          version: '1.0.0',
          usageCount: 0,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z'
        };

        expect(validCategories).toContain(agent.category);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle agent with minimal required fields only', () => {
      const minimalAgent: Agent = {
        id: 'minimal-agent',
        name: 'Minimal Agent',
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: [],
        isPublic: false,
        version: '1.0.0',
        usageCount: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      // All required fields should be present
      expect(minimalAgent.id).toBeDefined();
      expect(minimalAgent.name).toBeDefined();
      expect(minimalAgent.model).toBeDefined();
      expect(minimalAgent.starshipId).toBeDefined();
      expect(minimalAgent.authorId).toBeDefined();
      expect(minimalAgent.category).toBeDefined();
      expect(minimalAgent.tags).toBeDefined();
      expect(minimalAgent.isPublic).toBeDefined();
      expect(minimalAgent.version).toBeDefined();
      expect(minimalAgent.usageCount).toBeDefined();
      expect(minimalAgent.createdAt).toBeDefined();
      expect(minimalAgent.updatedAt).toBeDefined();

      // Optional fields should be undefined
      expect(minimalAgent.systemPrompt).toBeUndefined();
      expect(minimalAgent.description).toBeUndefined();
      expect(minimalAgent.rating).toBeUndefined();
      expect(minimalAgent.temperature).toBeUndefined();
      expect(minimalAgent.maxTokens).toBeUndefined();
      expect(minimalAgent.customInstructions).toBeUndefined();
      expect(minimalAgent.allowedStarshipClasses).toBeUndefined();
      expect(minimalAgent.requiredPermissions).toBeUndefined();
    });

    it('should handle agent with empty arrays and edge values', () => {
      const edgeCaseAgent: Agent = {
        id: 'edge-case-agent',
        name: '',  // Edge case: empty string
        model: 'gpt-4',
        starshipId: 'starship-123',
        authorId: 'user-123',
        category: 'general',
        tags: [], // Edge case: empty array
        isPublic: true,
        version: '0.0.1', // Edge case: minimal version
        usageCount: 0, // Edge case: zero usage
        rating: 0, // Edge case: minimum rating
        temperature: 0, // Edge case: minimum temperature
        maxTokens: 1, // Edge case: minimum tokens
        allowedStarshipClasses: [], // Edge case: empty array
        requiredPermissions: [], // Edge case: empty array
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };

      // Should still be valid schema-wise
      expect(typeof edgeCaseAgent.name).toBe('string');
      expect(Array.isArray(edgeCaseAgent.tags)).toBe(true);
      expect(edgeCaseAgent.tags.length).toBe(0);
      expect(edgeCaseAgent.usageCount).toBe(0);
      expect(edgeCaseAgent.rating).toBe(0);
      expect(edgeCaseAgent.temperature).toBe(0);
      expect(edgeCaseAgent.maxTokens).toBe(1);
      expect(Array.isArray(edgeCaseAgent.allowedStarshipClasses)).toBe(true);
      expect(Array.isArray(edgeCaseAgent.requiredPermissions)).toBe(true);
    });
  });
});