/**
 * Generic Delta Encoder using RFC6902 JSON Patch
 *
 * A utility class for creating and applying JSON patches to a single state object.
 * Each instance manages one state and provides incremental updates via JSON patches.
 */

/**
 * RFC6902 JSON Patch Operation
 */
export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: any;
  from?: string;
}

/**
 * Patch result containing the operations and updated state
 */
export interface PatchResult<T> {
  patch: JsonPatchOperation[];
  state: T;
  version: number;
}

/**
 * Generic Delta Encoder for streaming updates using RFC6902 JSON Patch
 */
export class DeltaEncoder<T = any> {
  private state: T;
  private version: number = 0;

  constructor(initialState: T) {
    this.state = JSON.parse(JSON.stringify(initialState)); // Deep clone
  }

  /**
   * Get current state
   */
  getCurrentState(): T {
    return JSON.parse(JSON.stringify(this.state)); // Return deep clone
  }

  /**
   * Get current version
   */
  getCurrentVersion(): number {
    return this.version;
  }

  /**
   * Reset state to a new value
   */
  setState(newState: T): PatchResult<T> {
    const patch: JsonPatchOperation[] = [
      {
        op: 'replace',
        path: '',
        value: newState,
      },
    ];

    this.state = JSON.parse(JSON.stringify(newState)); // Deep clone
    this.version++;

    return { patch, state: this.getCurrentState(), version: this.version };
  }

  /**
   * Add a value at a specific path
   */
  add(path: string, value: any): PatchResult<T> {
    const patch: JsonPatchOperation[] = [
      {
        op: 'add',
        path,
        value,
      },
    ];

    this.state = DeltaEncoder.applyPatch(this.state, patch);
    this.version++;

    return { patch, state: this.getCurrentState(), version: this.version };
  }

  /**
   * Replace a value at a specific path
   */
  replace(path: string, value: any): PatchResult<T> {
    const patch: JsonPatchOperation[] = [
      {
        op: 'replace',
        path,
        value,
      },
    ];

    this.state = DeltaEncoder.applyPatch(this.state, patch);
    this.version++;

    return { patch, state: this.getCurrentState(), version: this.version };
  }

  /**
   * Remove a value at a specific path
   */
  remove(path: string): PatchResult<T> {
    const patch: JsonPatchOperation[] = [
      {
        op: 'remove',
        path,
      },
    ];

    this.state = DeltaEncoder.applyPatch(this.state, patch);
    this.version++;

    return { patch, state: this.getCurrentState(), version: this.version };
  }

  /**
   * Move a value from one path to another
   */
  move(from: string, path: string): PatchResult<T> {
    const patch: JsonPatchOperation[] = [
      {
        op: 'move',
        from,
        path,
      },
    ];

    this.state = DeltaEncoder.applyPatch(this.state, patch);
    this.version++;

    return { patch, state: this.getCurrentState(), version: this.version };
  }

  /**
   * Copy a value from one path to another
   */
  copy(from: string, path: string): PatchResult<T> {
    const patch: JsonPatchOperation[] = [
      {
        op: 'copy',
        from,
        path,
      },
    ];

    this.state = DeltaEncoder.applyPatch(this.state, patch);
    this.version++;

    return { patch, state: this.getCurrentState(), version: this.version };
  }

  /**
   * Test a value at a specific path
   */
  test(path: string, value: any): PatchResult<T> {
    const patch: JsonPatchOperation[] = [
      {
        op: 'test',
        path,
        value,
      },
    ];

    // Test operations don't change the state, just validate
    DeltaEncoder.applyPatch(this.state, patch);

    return { patch, state: this.getCurrentState(), version: this.version };
  }

  /**
   * Apply multiple operations at once
   */
  applyOperations(operations: JsonPatchOperation[]): PatchResult<T> {
    this.state = DeltaEncoder.applyPatch(this.state, operations);
    this.version++;

    return { patch: operations, state: this.getCurrentState(), version: this.version };
  }

  /**
   * Reset to initial state
   */
  reset(initialState: T): PatchResult<T> {
    this.state = JSON.parse(JSON.stringify(initialState)); // Deep clone
    this.version = 0;

    const patch: JsonPatchOperation[] = [
      {
        op: 'replace',
        path: '',
        value: this.getCurrentState(),
      },
    ];

    return { patch, state: this.getCurrentState(), version: this.version };
  }

  /**
   * Apply a JSON patch to any object (static utility method)
   */
  static applyPatch<T>(target: T, patch: JsonPatchOperation[]): T {
    let result = JSON.parse(JSON.stringify(target)); // Deep clone

    for (const operation of patch) {
      result = this.applyOperation(result, operation);
    }

    return result;
  }

  /**
   * Create a patch by comparing two objects (static utility method)
   */
  static createPatch<T>(source: T, target: T): JsonPatchOperation[] {
    // This is a simplified diff implementation
    // For production use, consider using a library like 'fast-json-patch'
    return this.diff(source, target, '');
  }

  /**
   * Apply a single JSON patch operation (internal)
   */
  private static applyOperation(target: any, operation: JsonPatchOperation): any {
    const pathParts = operation.path === '' ? [] : operation.path.split('/').slice(1);

    switch (operation.op) {
      case 'add':
        return this.applyAdd(target, pathParts, operation.value);
      case 'remove':
        return this.applyRemove(target, pathParts);
      case 'replace':
        return this.applyReplace(target, pathParts, operation.value);
      case 'move':
        if (!operation.from) throw new Error('Move operation requires "from" path');
        return this.applyMove(target, pathParts, operation.from.split('/').slice(1));
      case 'copy':
        if (!operation.from) throw new Error('Copy operation requires "from" path');
        return this.applyCopy(target, pathParts, operation.from.split('/').slice(1));
      case 'test':
        this.applyTest(target, pathParts, operation.value);
        return target;
      default:
        throw new Error(`Unsupported operation: ${operation.op}`);
    }
  }

  /**
   * Apply add operation (internal)
   */
  private static applyAdd(target: any, pathParts: string[], value: any): any {
    if (pathParts.length === 0) {
      return value;
    }

    const result = Array.isArray(target) ? [...target] : { ...target };
    const key = pathParts[0];

    if (pathParts.length === 1) {
      if (Array.isArray(result)) {
        const index = key === '-' ? result.length : parseInt(key, 10);
        result.splice(index, 0, value);
      } else {
        result[key] = value;
      }
    } else {
      result[key] = this.applyAdd(result[key] || {}, pathParts.slice(1), value);
    }

    return result;
  }

  /**
   * Apply remove operation (internal)
   */
  private static applyRemove(target: any, pathParts: string[]): any {
    if (pathParts.length === 0) {
      throw new Error('Cannot remove root');
    }

    const result = Array.isArray(target) ? [...target] : { ...target };
    const key = pathParts[0];

    if (pathParts.length === 1) {
      if (Array.isArray(result)) {
        result.splice(parseInt(key, 10), 1);
      } else {
        delete result[key];
      }
    } else {
      result[key] = this.applyRemove(result[key], pathParts.slice(1));
    }

    return result;
  }

  /**
   * Apply replace operation (internal)
   */
  private static applyReplace(target: any, pathParts: string[], value: any): any {
    if (pathParts.length === 0) {
      return value;
    }

    const result = Array.isArray(target) ? [...target] : { ...target };
    const key = pathParts[0];

    if (pathParts.length === 1) {
      result[key] = value;
    } else {
      result[key] = this.applyReplace(result[key], pathParts.slice(1), value);
    }

    return result;
  }

  /**
   * Apply move operation (internal)
   */
  private static applyMove(target: any, toPathParts: string[], fromPathParts: string[]): any {
    const value = this.getValue(target, fromPathParts);
    let result = this.applyRemove(target, fromPathParts);
    result = this.applyAdd(result, toPathParts, value);
    return result;
  }

  /**
   * Apply copy operation (internal)
   */
  private static applyCopy(target: any, toPathParts: string[], fromPathParts: string[]): any {
    const value = this.getValue(target, fromPathParts);
    return this.applyAdd(target, toPathParts, value);
  }

  /**
   * Apply test operation (internal)
   */
  private static applyTest(target: any, pathParts: string[], value: any): void {
    const actualValue = this.getValue(target, pathParts);
    if (JSON.stringify(actualValue) !== JSON.stringify(value)) {
      throw new Error(`Test operation failed at path /${pathParts.join('/')}`);
    }
  }

  /**
   * Get value at path (internal utility)
   */
  private static getValue(target: any, pathParts: string[]): any {
    let current = target;

    for (const part of pathParts) {
      if (current === null || current === undefined) {
        throw new Error(`Cannot access property '${part}' of ${current}`);
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Simple diff implementation (internal)
   */
  private static diff(source: any, target: any, basePath: string): JsonPatchOperation[] {
    const patches: JsonPatchOperation[] = [];

    // This is a simplified implementation
    // For production use, consider using 'fast-json-patch' or similar
    if (JSON.stringify(source) !== JSON.stringify(target)) {
      patches.push({
        op: 'replace',
        path: basePath,
        value: target,
      });
    }

    return patches;
  }
}

/**
 * Specialized DeltaEncoder for arrays (convenience class)
 */
export class ArrayDeltaEncoder<T = any> extends DeltaEncoder<T[]> {
  constructor(initialArray: T[] = []) {
    super(initialArray);
  }

  /**
   * Append item to array
   */
  append(item: T): PatchResult<T[]> {
    const currentState = this.getCurrentState();
    return this.add(`/${currentState.length}`, item);
  }

  /**
   * Prepend item to array
   */
  prepend(item: T): PatchResult<T[]> {
    return this.add('/0', item);
  }

  /**
   * Update item at index
   */
  updateAt(index: number, item: T): PatchResult<T[]> {
    return this.replace(`/${index}`, item);
  }

  /**
   * Remove item at index
   */
  removeAt(index: number): PatchResult<T[]> {
    return this.remove(`/${index}`);
  }

  /**
   * Find index of item and update it
   */
  updateWhere(predicate: (item: T) => boolean, newItem: T): PatchResult<T[]> | null {
    const currentState = this.getCurrentState();
    const index = currentState.findIndex(predicate);

    if (index === -1) {
      return null;
    }

    return this.updateAt(index, newItem);
  }

  /**
   * Find index of item and remove it
   */
  removeWhere(predicate: (item: T) => boolean): PatchResult<T[]> | null {
    const currentState = this.getCurrentState();
    const index = currentState.findIndex(predicate);

    if (index === -1) {
      return null;
    }

    return this.removeAt(index);
  }
}

/**
 * Specialized DeltaEncoder for objects (convenience class)
 */
export class ObjectDeltaEncoder<T = Record<string, any>> extends DeltaEncoder<T> {
  constructor(initialObject: T) {
    super(initialObject);
  }

  /**
   * Set property
   */
  setProperty(property: string, value: any): PatchResult<T> {
    return this.replace(`/${property}`, value);
  }

  /**
   * Remove property
   */
  removeProperty(property: string): PatchResult<T> {
    return this.remove(`/${property}`);
  }

  /**
   * Add property (alias for setProperty)
   */
  addProperty(property: string, value: any): PatchResult<T> {
    return this.add(`/${property}`, value);
  }
}
