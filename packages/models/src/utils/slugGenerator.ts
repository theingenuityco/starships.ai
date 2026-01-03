/**
 * Slug Generation Utilities
 *
 * Provides utilities for generating unique slugs for agents and other entities.
 * Ensures slugs follow the pattern: {template-slug}-{random-suffix}
 */

import { AgentRepository } from '../repositories/AgentRepository';
import { ToolRepository } from '../repositories/ToolRepository';
import type { WidgetRepository } from '../repositories/WidgetRepository';
import { generateSlug } from '../helpers/slugUtils';

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
 * Generate a unique agent slug (LEGACY)
 * Format: {base}-{random-suffix}
 *
 * @param templateSlug - The slug of the agent template
 * @param agentRepository - Repository instance for checking uniqueness
 * @returns Promise<string> - Unique agent slug
 */
export async function generateUniqueAgentSlug(templateSlug: string, agentRepository: AgentRepository): Promise<string> {
  const baseSlug = templateSlug;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomSuffix = generateRandomSuffix();
    const candidateSlug = `${baseSlug}-${randomSuffix}`;

    // Check if slug is unique
    const existingAgent = await agentRepository.findBySlug(candidateSlug);
    if (!existingAgent) {
      return candidateSlug;
    }

    attempts++;
  }

  // Fallback: use timestamp if we can't generate a unique slug
  const timestamp = Date.now().toString(36);
  return `${baseSlug}-${timestamp}`;
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
 * Generate a unique tool slug
 * Format: {base-slug}-{random-suffix}
 *
 * @param baseSlug - Suggested base slug (often the template slug or provided slug)
 * @param toolRepository - Repository instance for checking uniqueness
 */
export async function generateUniqueToolSlug(baseSlug: string, toolRepository: ToolRepository): Promise<string> {
  const base = baseSlug;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomSuffix = generateRandomSuffix();
    const candidateSlug = `${base}-${randomSuffix}`;

    // Check if slug is unique across all tools
    const existingTool = await toolRepository.findBySlug(candidateSlug);
    if (!existingTool) {
      return candidateSlug;
    }

    attempts++;
  }

  const timestamp = Date.now().toString(36);
  return `${base}-${timestamp}`;
}

/**
 * Generate a unique slug using incremental numeric suffixes: base, base-2, base-3, ...
 *
 * This is used for INSTANCE slugs where we prefer human-stable readability and deterministic collision resolution.
 */
export async function generateUniqueSlugIncremental(
  baseSlug: string,
  exists: (candidate: string) => Promise<boolean>,
  opts?: { fallbackBase?: string; maxAttempts?: number; maxLength?: number }
): Promise<string> {
  const fallbackBase = generateSlug((opts?.fallbackBase || 'item').toString()) || 'item';
  const maxAttempts = opts?.maxAttempts ?? 10_000;
  const maxLength = opts?.maxLength ?? 100;

  const base = generateSlug(baseSlug) || fallbackBase;
  const trimmedBase = base.slice(0, Math.max(1, Math.min(maxLength, base.length)));

  // Try base first
  if (!(await exists(trimmedBase))) return trimmedBase;

  // Then try base-2, base-3, ...
  for (let counter = 2; counter < maxAttempts; counter++) {
    const suffix = `-${counter}`;
    const candidate = `${trimmedBase.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }

  const ts = Date.now().toString(36);
  const suffix = `-${ts}`;
  return `${trimmedBase.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
}

/**
 * Generate a unique slug using a random suffix: base-r4nd
 *
 * This is used for TEMPLATE slugs to make them non-guessable and avoid incremental collisions.
 * By default we always include a random suffix to avoid stable/guessable template slugs.
 */
export async function generateUniqueSlugRandomSuffix(
  baseSlug: string,
  exists: (candidate: string) => Promise<boolean>,
  opts?: { fallbackBase?: string; maxAttempts?: number; maxLength?: number; alwaysSuffix?: boolean }
): Promise<string> {
  const fallbackBase = generateSlug((opts?.fallbackBase || 'item').toString()) || 'item';
  const maxAttempts = opts?.maxAttempts ?? 100;
  const maxLength = opts?.maxLength ?? 100;
  const alwaysSuffix = opts?.alwaysSuffix ?? true;

  const base = generateSlug(baseSlug) || fallbackBase;
  const effectiveBase = base.slice(0, Math.max(1, Math.min(maxLength, base.length)));

  if (!alwaysSuffix) {
    if (!(await exists(effectiveBase))) return effectiveBase;
  }

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const rand = generateRandomSuffix();
    const suffix = `-${rand}`;
    const candidate = `${effectiveBase.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }

  const ts = Date.now().toString(36);
  const suffix = `-${ts}`;
  return `${effectiveBase.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
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
