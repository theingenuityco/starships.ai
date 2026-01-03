/**
 * Slug Generation Utilities
 *
 * Provides utilities for generating unique slugs for agents and other entities.
 *
 * IMPORTANT (slug strategy):
 * - Instance slugs (agents/tools) use incremental suffixes: {base}, {base}-2, {base}-3, ...
 *   Uniqueness is enforced within a starship (composite uniqueness: starship_id + slug).
 * - Template slugs (agent/tool templates) use random suffixes: {base}-{random-suffix}
 *   Uniqueness is enforced globally (slug unique on the template table).
 */

import type { WidgetRepository } from '../repositories/WidgetRepository';

/**
 * Generate a random suffix for slugs
 * Format: 4-character alphanumeric string
 */
export function generateRandomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique slug using incremental suffixes:
 * - base
 * - base-2
 * - base-3
 * ...
 *
 * @param baseSlug - The desired base slug (already slugified)
 * @param isTaken - Async predicate that returns true when the slug is already used
 * @returns Promise<string> - Unique slug
 */
export async function generateUniqueSlugIncremental(args: {
  baseSlug: string;
  isTaken: (candidate: string) => Promise<boolean>;
  /**
   * When the base is taken, start counting from this value (default 2).
   * We intentionally skip "-1" to keep the common human pattern.
   */
  startAt?: number;
  maxAttempts?: number;
}): Promise<string> {
  const base = (args.baseSlug || '').trim();
  const fallbackBase = base.length > 0 ? base : 'item';

  // Fast-path: base slug is free
  if (!(await args.isTaken(fallbackBase))) {
    return fallbackBase;
  }

  // Otherwise suffix with -2, -3, ... until free
  let counter = typeof args.startAt === 'number' && args.startAt >= 2 ? Math.floor(args.startAt) : 2;
  const maxAttempts = typeof args.maxAttempts === 'number' && args.maxAttempts > 0 ? Math.floor(args.maxAttempts) : 10_000;
  while (counter < maxAttempts) {
    const candidate = `${fallbackBase}-${counter}`;
    if (!(await args.isTaken(candidate))) return candidate;
    counter++;
  }

  // Fallback: timestamp if something is seriously wrong
  const ts = Date.now().toString(36);
  return `${fallbackBase}-${ts}`;
}

/**
 * Generate a unique slug using a random suffix:
 * Format: {base}-{random-suffix}
 *
 * @param baseSlug - The desired base slug (already slugified)
 * @param isTaken - Async predicate that returns true when the slug is already used
 * @returns Promise<string> - Unique slug
 */
export async function generateUniqueSlugRandom(args: {
  baseSlug: string;
  isTaken: (candidate: string) => Promise<boolean>;
  maxAttempts?: number;
}): Promise<string> {
  const base = (args.baseSlug || '').trim();
  const fallbackBase = base.length > 0 ? base : 'item';
  let attempts = 0;
  const maxAttempts = typeof args.maxAttempts === 'number' && args.maxAttempts > 0 ? Math.floor(args.maxAttempts) : 10;

  while (attempts < maxAttempts) {
    const randomSuffix = generateRandomSuffix();
    const candidateSlug = `${fallbackBase}-${randomSuffix}`;

    // Check if slug is unique
    const taken = await args.isTaken(candidateSlug);
    if (!taken) {
      return candidateSlug;
    }

    attempts++;
  }

  // Fallback: use timestamp if we can't generate a unique slug
  const timestamp = Date.now().toString(36);
  return `${fallbackBase}-${timestamp}`;
}

/**
 * Generate a simple unique slug (for cases where no template is involved)
 * Format: agent-{random-suffix}
 *
 * @param agentRepository - Repository instance for checking uniqueness
 * @returns Promise<string> - Unique agent slug
 */
export async function generateSimpleAgentSlug(agentRepository: AgentRepository): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomSuffix = generateRandomSuffix();
    const candidateSlug = `agent-${randomSuffix}`;

    // Check if slug is unique
    const existingAgent = await agentRepository.findBySlug(candidateSlug);
    if (!existingAgent) {
      return candidateSlug;
    }

    attempts++;
  }

  // Fallback: use timestamp if we can't generate a unique slug
  const timestamp = Date.now().toString(36);
  return `agent-${timestamp}`;
}

/**
 * Generate a unique widget slug
 * Format: widget-{random-suffix}
 *
 * @param starshipId - The starship ID to check uniqueness within
 * @param widgetRepository - Repository instance for checking uniqueness
 * @returns Promise<string> - Unique widget slug
 */
export async function generateUniqueWidgetSlug(starshipId: string, widgetRepository: WidgetRepository): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomSuffix = generateRandomSuffix();
    const candidateSlug = `widget-${randomSuffix}`;

    // Check if slug is unique within the starship
    const existingWidget = await widgetRepository.findBySlug(candidateSlug, starshipId);
    if (!existingWidget) {
      return candidateSlug;
    }

    attempts++;
  }

  // Fallback: use timestamp if we can't generate a unique slug
  const timestamp = Date.now().toString(36);
  return `widget-${timestamp}`;
}
