/**
 * Tool Templates Index
 * Exports all tool templates from individual files
 */

export { calculatorToolTemplate } from './calculator';
export { timeToolTemplate } from './time';
export { echoToolTemplate } from './echo';
export { wikipediaToolTemplate } from './wikipedia';
export { duckduckgoToolTemplate } from './duckduckgo';
export { toolListToolTemplate } from './tool-list';
export { toolGetToolTemplate } from './tool-get';
export { toolOpenNewToolTemplate } from './tool-open-new';
export { toolOpenToolTemplate } from './tool-open';
export { toolEditToolTemplate } from './tool-edit';
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
import { toolListToolTemplate } from './tool-list';
import { toolGetToolTemplate } from './tool-get';
import { toolOpenNewToolTemplate } from './tool-open-new';
import { toolOpenToolTemplate } from './tool-open';
import { toolEditToolTemplate } from './tool-edit';
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
  toolListToolTemplate,
  toolGetToolTemplate,
  toolOpenNewToolTemplate,
  toolOpenToolTemplate,
  toolEditToolTemplate,
  blueprintLintToolTemplate,
  toolTestToolTemplate,
  nodeSchemaIntrospectionToolTemplate,
  blueprintExamplesToolTemplate,
];
