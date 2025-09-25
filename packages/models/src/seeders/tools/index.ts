/**
 * Tool Templates Index
 * Exports all tool templates from individual files
 */

export { calculatorToolTemplate } from './calculator';
export { timeToolTemplate } from './time';
export { echoToolTemplate } from './echo';
export { toolListToolTemplate } from './tool-list';
export { toolGetToolTemplate } from './tool-get';
export { toolCreateToolTemplate } from './tool-create';
export { toolUpdateToolTemplate } from './tool-update';
export { blueprintLintToolTemplate } from './blueprint-lint';
export { toolSmokeTestToolTemplate } from './tool-test';

// Re-export all tool templates as a single array for convenience
import { calculatorToolTemplate } from './calculator';
import { timeToolTemplate } from './time';
import { echoToolTemplate } from './echo';
import { toolListToolTemplate } from './tool-list';
import { toolGetToolTemplate } from './tool-get';
import { toolCreateToolTemplate } from './tool-create';
import { toolUpdateToolTemplate } from './tool-update';
import { blueprintLintToolTemplate } from './blueprint-lint';
import { toolSmokeTestToolTemplate } from './tool-test';

export const ALL_TOOL_TEMPLATES = [
  calculatorToolTemplate,
  timeToolTemplate,
  echoToolTemplate,
  toolListToolTemplate,
  toolGetToolTemplate,
  toolCreateToolTemplate,
  toolUpdateToolTemplate,
  blueprintLintToolTemplate,
  toolSmokeTestToolTemplate,
];
