/**
 * Agent Templates Index
 * Exports all agent templates from individual files
 */

// Temporarily commenting out Sybil agent
// export { sybilTemplate } from './sybil';
export { gaiaTemplate } from './gaia';
// Research Assistant removed from production
// export { researchTemplate } from './research';
export { daedalusTemplate } from './daedalus';
export { keplerTemplate } from './kepler';
export { ariaTemplate } from './aria';
// piperTemplate: use seed:piper-one-off for local-only; not in prod seed
export { piperTemplate } from './piper';

// Re-export all agent templates as a single array for convenience
// import { sybilTemplate } from './sybil';
import { gaiaTemplate } from './gaia';
// Research Assistant removed from production
// import { researchTemplate } from './research';
import { daedalusTemplate } from './daedalus';
import { keplerTemplate } from './kepler';
import { ariaTemplate } from './aria';

// Sybil removed from the array temporarily
// Research Assistant removed from production
// Piper: local one-off only, not in prod
export const ALL_AGENT_TEMPLATES = [
  /* sybilTemplate, */ gaiaTemplate,
  /* researchTemplate, */
  daedalusTemplate,
  keplerTemplate,
  ariaTemplate,
];
