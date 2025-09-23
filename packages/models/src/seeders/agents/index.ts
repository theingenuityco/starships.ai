/**
 * Agent Templates Index
 * Exports all agent templates from individual files
 */

export { sybilTemplate } from './sybil';
export { gaiaTemplate } from './gaia';
export { daedalusTemplate } from './daedalus';

// Re-export all agent templates as a single array for convenience
import { sybilTemplate } from './sybil';
import { gaiaTemplate } from './gaia';
import { daedalusTemplate } from './daedalus';

export const ALL_AGENT_TEMPLATES = [sybilTemplate, gaiaTemplate, daedalusTemplate];
