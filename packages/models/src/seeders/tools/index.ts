/**
 * Tool Templates Index
 * Exports all tool templates from individual files
 */

export { calculatorToolTemplate } from './calculator';
export { timeToolTemplate } from './time';
export { echoToolTemplate } from './echo';
export { wikipediaToolTemplate } from './wikipedia';
export { duckduckgoToolTemplate } from './duckduckgo';
export { openalexToolTemplate } from './openalex';
export { toolListToolTemplate } from './tool-list';
export { toolGetToolTemplate } from './tool-get';
export { toolCreateToolTemplate } from './tool-create';
export { toolUpdateToolTemplate } from './tool-update';
export { blueprintLintToolTemplate } from './blueprint-lint';
export { toolTestToolTemplate } from './tool-test';
export { nodeSchemaIntrospectionToolTemplate } from './node-schema';
export { blueprintExamplesToolTemplate } from './blueprint-examples';

// Re-export all tool templates as a single array for convenience
import { calculatorToolTemplate } from './calculator';
import { timeToolTemplate } from './time';
import { echoToolTemplate } from './echo';
import { wikipediaToolTemplate } from './wikipedia';
import { duckduckgoToolTemplate } from './duckduckgo';
import { openalexToolTemplate } from './openalex';
import { toolListToolTemplate } from './tool-list';
import { toolGetToolTemplate } from './tool-get';
import { toolCreateToolTemplate } from './tool-create';
import { toolUpdateToolTemplate } from './tool-update';
import { blueprintLintToolTemplate } from './blueprint-lint';
import { toolTestToolTemplate } from './tool-test';
import { nodeSchemaIntrospectionToolTemplate } from './node-schema';
import { blueprintExamplesToolTemplate } from './blueprint-examples';

export const ALL_TOOL_TEMPLATES = [
  calculatorToolTemplate,
  timeToolTemplate,
  echoToolTemplate,
  wikipediaToolTemplate,
  duckduckgoToolTemplate,
  openalexToolTemplate,
  toolListToolTemplate,
  toolGetToolTemplate,
  toolCreateToolTemplate,
  toolUpdateToolTemplate,
  blueprintLintToolTemplate,
  toolTestToolTemplate,
  nodeSchemaIntrospectionToolTemplate,
  blueprintExamplesToolTemplate,
];
