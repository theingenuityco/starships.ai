/**
 * Tool Templates Index
 * Exports all tool templates from individual files
 */

export { calculatorToolTemplate } from './calculator';
export { timeToolTemplate } from './time';
export { echoToolTemplate } from './echo';

// Re-export all tool templates as a single array for convenience
import { calculatorToolTemplate } from './calculator';
import { timeToolTemplate } from './time';
import { echoToolTemplate } from './echo';

export const ALL_TOOL_TEMPLATES = [calculatorToolTemplate, timeToolTemplate, echoToolTemplate];
