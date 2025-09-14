/**
 * Client-side Delta utilities for applying RFC6902 delta chunks
 *
 * Simple implementation for applying delta chunks received from streaming
 */

import type { StreamingDeltaChunk } from '@starships/protocol'

/**
 * Apply delta chunks to any object
 */
export function applyDeltas<T>(target: T, deltas: StreamingDeltaChunk[]): T {
  let result = JSON.parse(JSON.stringify(target)) // Deep clone

  for (const delta of deltas) {
    result = applyDelta(result, delta)
  }

  return result
}

/**
 * Apply a single delta chunk
 */
function applyDelta(target: any, delta: StreamingDeltaChunk): any {
  const pathParts = delta.path === '' ? [] : delta.path.split('/').slice(1)

  switch (delta.op) {
    case 'add':
      return applyAdd(target, pathParts, delta.value)
    case 'remove':
      return applyRemove(target, pathParts)
    case 'replace':
      return applyReplace(target, pathParts, delta.value)
    case 'move':
      if (!delta.from) throw new Error('Move operation requires "from" path')
      return applyMove(target, pathParts, delta.from.split('/').slice(1))
    case 'copy':
      if (!delta.from) throw new Error('Copy operation requires "from" path')
      return applyCopy(target, pathParts, delta.from.split('/').slice(1))
    case 'test':
      applyTest(target, pathParts, delta.value)
      return target
    default:
      throw new Error(`Unsupported operation: ${delta.op}`)
  }
}

/**
 * Apply add operation
 */
function applyAdd(target: any, pathParts: string[], value: any): any {
  if (pathParts.length === 0) {
    return value
  }

  const result = Array.isArray(target) ? [...target] : { ...target }
  const key = pathParts[0]

  if (pathParts.length === 1) {
    if (Array.isArray(result)) {
      const index = key === '-' ? result.length : parseInt(key, 10)
      result.splice(index, 0, value)
    } else {
      result[key] = value
    }
  } else {
    result[key] = applyAdd(result[key] || {}, pathParts.slice(1), value)
  }

  return result
}

/**
 * Apply remove operation
 */
function applyRemove(target: any, pathParts: string[]): any {
  if (pathParts.length === 0) {
    throw new Error('Cannot remove root')
  }

  const result = Array.isArray(target) ? [...target] : { ...target }
  const key = pathParts[0]

  if (pathParts.length === 1) {
    if (Array.isArray(result)) {
      result.splice(parseInt(key, 10), 1)
    } else {
      delete result[key]
    }
  } else {
    result[key] = applyRemove(result[key], pathParts.slice(1))
  }

  return result
}

/**
 * Apply replace operation
 */
function applyReplace(target: any, pathParts: string[], value: any): any {
  if (pathParts.length === 0) {
    return value
  }

  const result = Array.isArray(target) ? [...target] : { ...target }
  const key = pathParts[0]

  if (pathParts.length === 1) {
    result[key] = value
  } else {
    result[key] = applyReplace(result[key], pathParts.slice(1), value)
  }

  return result
}

/**
 * Apply move operation
 */
function applyMove(target: any, toPathParts: string[], fromPathParts: string[]): any {
  const value = getValue(target, fromPathParts)
  let result = applyRemove(target, fromPathParts)
  result = applyAdd(result, toPathParts, value)
  return result
}

/**
 * Apply copy operation
 */
function applyCopy(target: any, toPathParts: string[], fromPathParts: string[]): any {
  const value = getValue(target, fromPathParts)
  return applyAdd(target, toPathParts, value)
}

/**
 * Apply test operation
 */
function applyTest(target: any, pathParts: string[], value: any): void {
  const actualValue = getValue(target, pathParts)
  if (JSON.stringify(actualValue) !== JSON.stringify(value)) {
    throw new Error(`Test operation failed at path /${pathParts.join('/')}`)
  }
}

/**
 * Get value at path
 */
function getValue(target: any, pathParts: string[]): any {
  let current = target

  for (const part of pathParts) {
    if (current === null || current === undefined) {
      throw new Error(`Cannot access property '${part}' of ${current}`)
    }
    current = current[part]
  }

  return current
}

/**
 * Validate delta chunks before applying them
 */
export function validateDeltas(deltas: StreamingDeltaChunk[]): boolean {
  try {
    for (const delta of deltas) {
      if (!delta.op || !delta.path) {
        console.warn('[DELTA] Invalid delta missing op or path:', delta)
        return false
      }

      if ((delta.op === 'move' || delta.op === 'copy') && !delta.from) {
        console.warn('[DELTA] Move/copy delta missing "from" path:', delta)
        return false
      }
    }
    return true
  } catch (error) {
    console.error('[DELTA] Delta validation error:', error)
    return false
  }
}

/**
 * Safe delta application with error handling
 */
export function safeApplyDeltas<T>(target: T, deltas: StreamingDeltaChunk[]): { success: boolean; result?: T; error?: string } {
  try {
    if (!validateDeltas(deltas)) {
      return { success: false, error: 'Invalid delta operations' }
    }

    const result = applyDeltas(target, deltas)
    return { success: true, result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown delta error'
    console.error('[DELTA] Failed to apply deltas:', errorMessage, { deltas, target })
    return { success: false, error: errorMessage }
  }
}
