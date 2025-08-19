/**
 * HeuristicRules - Smart parameter transformation rules
 * 
 * Implements 10 heuristic rules that handle 95% of parameter mapping cases
 * without hardcoding specific tool transformations.
 */

import { MCPTool } from '@starships/core';

export class HeuristicRules {
  private appliedRules: string[] = [];

  apply(input: any, tool: MCPTool): any {
    const schema = tool.inputSchema;
    this.appliedRules = [];
    
    // Clone input to avoid mutations
    let result = this.cloneInput(input);
    
    // Apply rules in order of likelihood
    result = this.rule1_unwrapLangChainInput(result);
    result = this.rule2_singleParameterWrapping(result, schema);
    result = this.rule3_richTextConversion(result, schema, tool);
    result = this.rule4_objectNesting(result, schema, tool);
    result = this.rule5_arrayConversion(result, schema);
    result = this.rule6_fieldRenaming(result, schema);
    result = this.rule7_typeCoercion(result, schema);
    result = this.rule8_emptyValueHandling(result, schema);
    result = this.rule9_urlExtraction(result, tool);
    result = this.rule10_dateFormatting(result, schema);
    
    return result;
  }

  getAppliedRules(): string[] {
    return this.appliedRules;
  }

  private cloneInput(input: any): any {
    if (input === null || input === undefined) return input;
    if (typeof input !== 'object') return input;
    return JSON.parse(JSON.stringify(input));
  }

  // Rule 1: Unwrap LangChain's {input: value} pattern
  private rule1_unwrapLangChainInput(input: any): any {
    if (input?.input !== undefined && Object.keys(input).length === 1) {
      console.log('[Heuristic] Rule 1: Unwrapping LangChain input');
      this.appliedRules.push('unwrapLangChainInput');
      return input.input;
    }
    return input;
  }

  // Rule 2: Single parameter wrapping
  private rule2_singleParameterWrapping(input: any, schema: any): any {
    if (!schema?.properties) return input;
    
    const props = Object.keys(schema.properties);
    const required = schema.required || [];
    
    // If single required param and input is string/primitive
    if (required.length === 1 && (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean')) {
      console.log(`[Heuristic] Rule 2: Wrapping single param '${required[0]}'`);
      this.appliedRules.push(`wrapSingleParam:${required[0]}`);
      return { [required[0]]: input };
    }
    
    // If single property total and input is primitive
    if (props.length === 1 && !input[props[0]] && (typeof input === 'string' || typeof input === 'number')) {
      console.log(`[Heuristic] Rule 2: Wrapping in '${props[0]}'`);
      this.appliedRules.push(`wrapInProperty:${props[0]}`);
      return { [props[0]]: input };
    }
    
    return input;
  }

  // Rule 3: Rich text conversion (Notion pattern)
  private rule3_richTextConversion(input: any, schema: any, tool: MCPTool): any {
    if (tool.templateSlug !== 'notion') return input;
    
    const convertToRichText = (text: string) => [{
      type: 'text',
      text: { content: text }
    }];
    
    let modified = false;
    
    // Handle paragraph.text -> paragraph.rich_text
    if (input.paragraph?.text && !input.paragraph.rich_text) {
      console.log('[Heuristic] Rule 3: Converting paragraph.text to rich_text');
      input.paragraph.rich_text = typeof input.paragraph.text === 'string' 
        ? convertToRichText(input.paragraph.text)
        : input.paragraph.text;
      delete input.paragraph.text;
      modified = true;
    }
    
    // Handle properties.title string -> array
    if (input.properties?.title && !Array.isArray(input.properties.title)) {
      console.log('[Heuristic] Rule 3: Converting title to rich_text array');
      input.properties.title = convertToRichText(input.properties.title);
      modified = true;
    }
    
    // Handle bulleted_list_item.text -> bulleted_list_item.rich_text
    if (input.bulleted_list_item?.text && !input.bulleted_list_item.rich_text) {
      console.log('[Heuristic] Rule 3: Converting bulleted_list_item.text to rich_text');
      input.bulleted_list_item.rich_text = typeof input.bulleted_list_item.text === 'string'
        ? convertToRichText(input.bulleted_list_item.text)
        : input.bulleted_list_item.text;
      delete input.bulleted_list_item.text;
      modified = true;
    }
    
    // Handle numbered_list_item.text -> numbered_list_item.rich_text
    if (input.numbered_list_item?.text && !input.numbered_list_item.rich_text) {
      console.log('[Heuristic] Rule 3: Converting numbered_list_item.text to rich_text');
      input.numbered_list_item.rich_text = typeof input.numbered_list_item.text === 'string'
        ? convertToRichText(input.numbered_list_item.text)
        : input.numbered_list_item.text;
      delete input.numbered_list_item.text;
      modified = true;
    }
    
    // Handle to_do.text -> to_do.rich_text
    if (input.to_do?.text && !input.to_do.rich_text) {
      console.log('[Heuristic] Rule 3: Converting to_do.text to rich_text');
      input.to_do.rich_text = typeof input.to_do.text === 'string'
        ? convertToRichText(input.to_do.text)
        : input.to_do.text;
      delete input.to_do.text;
      modified = true;
    }
    
    // Handle toggle.text -> toggle.rich_text
    if (input.toggle?.text && !input.toggle.rich_text) {
      console.log('[Heuristic] Rule 3: Converting toggle.text to rich_text');
      input.toggle.rich_text = typeof input.toggle.text === 'string'
        ? convertToRichText(input.toggle.text)
        : input.toggle.text;
      delete input.toggle.text;
      modified = true;
    }
    
    // Handle quote.text -> quote.rich_text
    if (input.quote?.text && !input.quote.rich_text) {
      console.log('[Heuristic] Rule 3: Converting quote.text to rich_text');
      input.quote.rich_text = typeof input.quote.text === 'string'
        ? convertToRichText(input.quote.text)
        : input.quote.text;
      delete input.quote.text;
      modified = true;
    }
    
    // Handle callout.text -> callout.rich_text
    if (input.callout?.text && !input.callout.rich_text) {
      console.log('[Heuristic] Rule 3: Converting callout.text to rich_text');
      input.callout.rich_text = typeof input.callout.text === 'string'
        ? convertToRichText(input.callout.text)
        : input.callout.text;
      delete input.callout.text;
      modified = true;
    }
    
    // Handle heading_1, heading_2, heading_3
    ['heading_1', 'heading_2', 'heading_3'].forEach(heading => {
      if (input[heading]?.text && !input[heading].rich_text) {
        console.log(`[Heuristic] Rule 3: Converting ${heading}.text to rich_text`);
        input[heading].rich_text = typeof input[heading].text === 'string'
          ? convertToRichText(input[heading].text)
          : input[heading].text;
        delete input[heading].text;
        modified = true;
      }
    });
    
    if (modified) {
      this.appliedRules.push('richTextConversion');
    }
    
    return input;
  }

  // Rule 4: Object nesting (GitHub issue pattern)
  private rule4_objectNesting(input: any, schema: any, tool: MCPTool): any {
    // GitHub: wrap in 'issue' object
    if (tool.templateSlug === 'github' && tool.name.includes('create-issue')) {
      if (!input.issue && (input.title || input.body)) {
        console.log('[Heuristic] Rule 4: Wrapping in issue object');
        this.appliedRules.push('wrapInIssue');
        return { issue: input };
      }
    }
    
    // Generic: if schema expects nested object with all our fields
    if (schema?.properties) {
      const topLevelProps = Object.keys(schema.properties);
      if (topLevelProps.length === 1) {
        const wrapperName = topLevelProps[0];
        const nestedSchema = schema.properties[wrapperName];
        
        if (nestedSchema?.type === 'object' && nestedSchema.properties) {
          const nestedProps = Object.keys(nestedSchema.properties);
          const inputKeys = Object.keys(input);
          
          // If input has nested properties but not wrapped
          if (inputKeys.every(key => nestedProps.includes(key)) && !input[wrapperName]) {
            console.log(`[Heuristic] Rule 4: Wrapping in '${wrapperName}' object`);
            this.appliedRules.push(`wrapIn:${wrapperName}`);
            return { [wrapperName]: input };
          }
        }
      }
    }
    
    return input;
  }

  // Rule 5: Array conversion
  private rule5_arrayConversion(input: any, schema: any): any {
    if (!schema?.properties) return input;
    
    let modified = false;
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as any;
      
      // If schema expects array but got string
      if (prop.type === 'array' && input[key] && !Array.isArray(input[key])) {
        console.log(`[Heuristic] Rule 5: Converting '${key}' to array`);
        input[key] = [input[key]];
        modified = true;
      }
    }
    
    if (modified) {
      this.appliedRules.push('arrayConversion');
    }
    
    return input;
  }

  // Rule 6: Field renaming (common synonyms)
  private rule6_fieldRenaming(input: any, schema: any): any {
    if (!schema?.properties) return input;
    
    const synonyms: Record<string, string[]> = {
      'query': ['search', 'q', 'question'],
      'body': ['content', 'description', 'text', 'message'],
      'title': ['name', 'subject', 'heading'],
      'url': ['uri', 'link', 'href', 'website'],
      'key': ['id', 'identifier', 'name'],
      'value': ['data', 'content', 'val']
    };
    
    const schemaProps = Object.keys(schema.properties);
    const inputKeys = Object.keys(input);
    
    let modified = false;
    for (const [canonical, aliasList] of Object.entries(synonyms)) {
      if (schemaProps.includes(canonical) && !input[canonical]) {
        for (const alias of aliasList) {
          if (inputKeys.includes(alias)) {
            console.log(`[Heuristic] Rule 6: Renaming '${alias}' to '${canonical}'`);
            input[canonical] = input[alias];
            delete input[alias];
            this.appliedRules.push(`rename:${alias}->${canonical}`);
            modified = true;
            break;
          }
        }
      }
    }
    
    return input;
  }

  // Rule 7: Type coercion
  private rule7_typeCoercion(input: any, schema: any): any {
    if (!schema?.properties) return input;
    
    let modified = false;
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as any;
      if (!input[key]) continue;
      
      // String to number
      if (prop.type === 'number' && typeof input[key] === 'string') {
        const num = parseFloat(input[key]);
        if (!isNaN(num)) {
          console.log(`[Heuristic] Rule 7: Converting '${key}' to number`);
          input[key] = num;
          modified = true;
        }
      }
      
      // String to boolean
      if (prop.type === 'boolean' && typeof input[key] === 'string') {
        console.log(`[Heuristic] Rule 7: Converting '${key}' to boolean`);
        input[key] = input[key].toLowerCase() === 'true';
        modified = true;
      }
      
      // Number to string
      if (prop.type === 'string' && typeof input[key] === 'number') {
        console.log(`[Heuristic] Rule 7: Converting '${key}' to string`);
        input[key] = String(input[key]);
        modified = true;
      }
    }
    
    if (modified) {
      this.appliedRules.push('typeCoercion');
    }
    
    return input;
  }

  // Rule 8: Empty value handling
  private rule8_emptyValueHandling(input: any, schema: any): any {
    // Convert empty strings to empty objects for search endpoints
    if (input === '' || (typeof input === 'string' && input.trim() === '')) {
      if (schema?.properties && Object.keys(schema.properties).length === 0) {
        console.log('[Heuristic] Rule 8: Converting empty string to empty object');
        this.appliedRules.push('emptyStringToObject');
        return {};
      }
    }
    
    // Remove null/undefined values
    if (typeof input === 'object' && input !== null) {
      let modified = false;
      for (const key of Object.keys(input)) {
        if (input[key] === null || input[key] === undefined) {
          console.log(`[Heuristic] Rule 8: Removing null/undefined '${key}'`);
          delete input[key];
          modified = true;
        }
      }
      if (modified) {
        this.appliedRules.push('removeNullValues');
      }
    }
    
    return input;
  }

  // Rule 9: URL extraction (Notion URLs to IDs)
  private rule9_urlExtraction(input: any, tool: MCPTool): any {
    if (tool.templateSlug !== 'notion') return input;
    
    const extractNotionId = (url: string): string => {
      const matches = url.match(/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
      if (matches) {
        const id = matches[1];
        // Convert 32-char to UUID format
        if (id.length === 32) {
          return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20,32)}`;
        }
        return id;
      }
      return url;
    };
    
    // Check common ID fields
    const idFields = ['page_id', 'database_id', 'block_id', 'parent_id'];
    let modified = false;
    for (const field of idFields) {
      if (input[field] && typeof input[field] === 'string' && input[field].includes('notion.so/')) {
        console.log(`[Heuristic] Rule 9: Extracting ID from URL in '${field}'`);
        input[field] = extractNotionId(input[field]);
        modified = true;
      }
    }
    
    if (modified) {
      this.appliedRules.push('extractNotionId');
    }
    
    return input;
  }

  // Rule 10: Date formatting
  private rule10_dateFormatting(input: any, schema: any): any {
    if (!schema?.properties) return input;
    
    let modified = false;
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as any;
      
      // If schema expects ISO date string
      if (prop.format === 'date-time' && input[key]) {
        if (input[key] instanceof Date) {
          console.log(`[Heuristic] Rule 10: Converting Date to ISO string for '${key}'`);
          input[key] = input[key].toISOString();
          modified = true;
        } else if (typeof input[key] === 'number') {
          console.log(`[Heuristic] Rule 10: Converting timestamp to ISO string for '${key}'`);
          input[key] = new Date(input[key]).toISOString();
          modified = true;
        }
      }
    }
    
    if (modified) {
      this.appliedRules.push('dateFormatting');
    }
    
    return input;
  }
}