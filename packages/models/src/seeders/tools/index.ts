/**
 * Tool Templates Index
 * Exports all tool templates from individual files
 */

export { calculatorToolTemplate } from './calculator';
export { timeToolTemplate } from './time';
export { echoToolTemplate } from './echo';
export { wikipediaToolTemplate, wikipediaTool } from './wikipedia';
export { duckduckgoToolTemplate, duckduckgoTool } from './duckduckgo';
export { toolListToolTemplate } from './tool-list';
export { toolCreateToolTemplate } from './tool-create';
export { toolUpdateToolTemplate } from './tool-update';
export { blueprintLintToolTemplate } from './blueprint-lint';
export { toolSmokeTestToolTemplate } from './tool-smoke-test';

// Re-export all tool templates as a single array for convenience
import { calculatorToolTemplate } from './calculator';
import { timeToolTemplate } from './time';
import { echoToolTemplate } from './echo';
import { wikipediaToolTemplate } from './wikipedia';
import { duckduckgoToolTemplate } from './duckduckgo';
import { toolListToolTemplate } from './tool-list';
import { toolCreateToolTemplate } from './tool-create';
import { toolUpdateToolTemplate } from './tool-update';
import { blueprintLintToolTemplate } from './blueprint-lint';
import { toolSmokeTestToolTemplate } from './tool-smoke-test';

export const ALL_TOOL_TEMPLATES = [
  calculatorToolTemplate,
  timeToolTemplate,
  echoToolTemplate,
  wikipediaToolTemplate,
  duckduckgoToolTemplate,
  toolListToolTemplate,
  toolCreateToolTemplate,
  toolUpdateToolTemplate,
  blueprintLintToolTemplate,
  toolSmokeTestToolTemplate,
];
