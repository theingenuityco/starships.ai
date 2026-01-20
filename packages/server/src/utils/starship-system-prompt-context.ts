import type { StarshipModel } from '@starships/protocol';

/**
 * Build the Starships + Starship details block that should be injected into every agent system prompt.
 *
 * Requirements:
 * - include a very concise brief about what Starships is
 * - followed by Starship name, Starship bio, Starship website for the current starship
 */
export function buildStarshipSystemPromptContext(starship: Pick<StarshipModel, 'name' | 'description' | 'websiteUrl'>): string {
  const name = typeof starship?.name === 'string' && starship.name.trim() ? starship.name.trim() : '(unknown)';
  const bio = typeof starship?.description === 'string' && starship.description.trim() ? starship.description.trim() : '(not set)';
  const website = typeof starship?.websiteUrl === 'string' && starship.websiteUrl.trim() ? starship.websiteUrl.trim() : '(not set)';

  return [
    '<starships_context>',
    'Starships.ai is a platform where each Starship is an AI workspace for an organization (company/startup/project), containing agents, tools/connectors, and conversations.',
    '',
    'Starship name: ' + name,
    'Starship bio: ' + bio,
    'Starship website: ' + website,
    '</starships_context>',
  ].join('\n');
}
