/**
 * Slug Generation Utilities
 *
 * Provides utilities for generating unique slugs for agents and other entities.
 * Ensures slugs follow the pattern: {template-slug}-{random-suffix}
 */

import { AgentRepository } from '../repositories/AgentRepository';
import { ToolRepository } from '../repositories/ToolRepository';

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
 * Generate a unique agent slug
 * Format: {template-slug}-{random-suffix}
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
