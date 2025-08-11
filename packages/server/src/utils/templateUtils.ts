/**
 * Prompt Template Utility
 * Safe, performant templating using lodash template with default delimiters
 * Focused on prompt templating while remaining generic and tree-shakable
 */

import { template } from 'lodash';

/**
 * Compile a prompt template string into a reusable function
 * Uses lodash default delimiters for safe templating
 * @param templateString - The template string with <%= %> interpolation
 * @returns Compiled template function
 */
export function compilePromptTemplate<T = any>(
  templateString: string
) {
  return template(templateString) as (data: T) => string;
}

/**
 * Render a prompt template string with data (one-time use)
 * Uses lodash default delimiters for safe templating
 * @param templateString - The template string  
 * @param data - Data to interpolate
 * @returns Rendered string
 */
export function renderPromptTemplate<T extends Record<string, any>>(
  templateString: string,
  data: T
): string {
  const compiledTemplate = template(templateString);
  return compiledTemplate(data);
}

/**
 * Type-safe prompt template compiler with data validation
 * @param templateString - The template string
 * @param dataValidator - Optional function to validate data shape
 * @returns Type-safe compiled template function
 */
export function createTypedPromptTemplate<T>(
  templateString: string,
  dataValidator?: (data: any) => data is T
) {
  const compiledTemplate = compilePromptTemplate<T>(templateString);
  
  return (data: T): string => {
    if (dataValidator && !dataValidator(data)) {
      throw new Error('Prompt template data validation failed');
    }
    return compiledTemplate(data);
  };
}

/**
 * Prompt template string literal tag for compile-time template creation
 * Usage: const promptTemplate = promptTemplateLiteral`Hello <%= data.name %>!`;
 */
export function promptTemplateLiteral(strings: TemplateStringsArray, ...values: any[]): string {
  return strings.reduce((result, string, i) => {
    return result + string + (values[i] || '');
  }, '');
}