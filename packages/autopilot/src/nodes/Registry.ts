/**
 * Node Handler Registry
 * 
 * Registry for managing workflow node handlers
 */

import { Handler } from './Handler';

/**
 * Registry for managing workflow node handlers
 */
export class Registry {
  private handlers: Map<string, Handler> = new Map();
  private initialized = false;

  constructor() {
    // Registry starts empty - handlers must be manually registered
  }

  /**
   * Register a node handler
   */
  register(handler: Handler): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`Overriding existing handler for node type: ${handler.type}`);
    }
    
    this.handlers.set(handler.type, handler);
    console.log(`Registered node handler: ${handler.type}`);
  }

  /**
   * Get handler for a node type
   */
  getHandler(type: string): Handler | null {
    return this.handlers.get(type) || null;
  }

  /**
   * Get all registered handler types
   */
  getSupportedTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a node type is supported
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Unregister a handler
   */
  unregister(type: string): boolean {
    const result = this.handlers.delete(type);
    if (result) {
      console.log(`Unregistered node handler: ${type}`);
    }
    return result;
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
    this.initialized = true;
    console.log('Cleared all node handlers');
  }
}