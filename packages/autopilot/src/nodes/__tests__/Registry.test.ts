/**
 * Registry Unit Tests
 */

import { Registry } from '../Registry';
import { Handler } from '../Handler';
import { Node, ExecutionContext, NodeResult, ValidationResult } from '../../types';

// Mock handler for testing
class MockHandler implements Handler {
  readonly type = 'mock';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    return {
      nodeId: node.id,
      success: true,
      data: { message: 'mock execution' },
      executedAt: new Date().toISOString(),
      duration: 100
    };
  }

  validate(node: Node): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'mock-icon';
  }
}

class AnotherMockHandler implements Handler {
  readonly type = 'another-mock';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    return {
      nodeId: node.id,
      success: true,
      data: { message: 'another mock execution' },
      executedAt: new Date().toISOString(),
      duration: 50
    };
  }

  validate(node: Node): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'another-mock-icon';
  }
}

describe('Registry', () => {
  let registry: Registry;
  let mockHandler: MockHandler;
  let anotherMockHandler: AnotherMockHandler;

  beforeEach(() => {
    registry = new Registry();
    mockHandler = new MockHandler();
    anotherMockHandler = new AnotherMockHandler();
  });

  describe('constructor', () => {
    it('should create an empty registry', () => {
      expect(registry.getSupportedTypes()).toEqual([]);
      expect(registry.hasHandler('any-type')).toBe(false);
    });
  });

  describe('register', () => {
    it('should register a handler successfully', () => {
      registry.register(mockHandler);
      
      expect(registry.hasHandler('mock')).toBe(true);
      expect(registry.getSupportedTypes()).toContain('mock');
    });

    it('should warn when overriding existing handler', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      registry.register(mockHandler);
      registry.register(mockHandler); // Register same handler again
      
      expect(consoleSpy).toHaveBeenCalledWith('Overriding existing handler for node type: mock');
      consoleSpy.mockRestore();
    });

    it('should log successful registration', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      registry.register(mockHandler);
      
      expect(consoleSpy).toHaveBeenCalledWith('Registered node handler: mock');
      consoleSpy.mockRestore();
    });
  });

  describe('getHandler', () => {
    it('should return registered handler', () => {
      registry.register(mockHandler);
      
      const handler = registry.getHandler('mock');
      expect(handler).toBe(mockHandler);
      expect(handler?.type).toBe('mock');
    });

    it('should return null for unregistered handler', () => {
      const handler = registry.getHandler('nonexistent');
      expect(handler).toBeNull();
    });
  });

  describe('getSupportedTypes', () => {
    it('should return empty array for empty registry', () => {
      expect(registry.getSupportedTypes()).toEqual([]);
    });

    it('should return all registered handler types', () => {
      registry.register(mockHandler);
      registry.register(anotherMockHandler);
      
      const types = registry.getSupportedTypes();
      expect(types).toHaveLength(2);
      expect(types).toContain('mock');
      expect(types).toContain('another-mock');
    });
  });

  describe('hasHandler', () => {
    it('should return false for empty registry', () => {
      expect(registry.hasHandler('any-type')).toBe(false);
    });

    it('should return true for registered handler', () => {
      registry.register(mockHandler);
      expect(registry.hasHandler('mock')).toBe(true);
    });

    it('should return false for unregistered handler', () => {
      registry.register(mockHandler);
      expect(registry.hasHandler('nonexistent')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should unregister existing handler', () => {
      registry.register(mockHandler);
      expect(registry.hasHandler('mock')).toBe(true);
      
      const result = registry.unregister('mock');
      expect(result).toBe(true);
      expect(registry.hasHandler('mock')).toBe(false);
    });

    it('should return false for nonexistent handler', () => {
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });

    it('should log successful unregistration', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      registry.register(mockHandler);
      registry.unregister('mock');
      
      expect(consoleSpy).toHaveBeenCalledWith('Unregistered node handler: mock');
      consoleSpy.mockRestore();
    });
  });

  describe('clear', () => {
    it('should clear all handlers', () => {
      registry.register(mockHandler);
      registry.register(anotherMockHandler);
      expect(registry.getSupportedTypes()).toHaveLength(2);
      
      registry.clear();
      expect(registry.getSupportedTypes()).toEqual([]);
      expect(registry.hasHandler('mock')).toBe(false);
      expect(registry.hasHandler('another-mock')).toBe(false);
    });

    it('should log clearing operation', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      registry.clear();
      
      expect(consoleSpy).toHaveBeenCalledWith('Cleared all node handlers');
      consoleSpy.mockRestore();
    });
  });
});