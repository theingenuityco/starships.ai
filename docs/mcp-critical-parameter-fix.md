# Critical MCP Parameter Mapping Fix

## Problem Statement

All MCP tools are failing because of parameter mismatches between what the LLM sends and what the tools expect. This is a system-wide issue affecting every MCP tool integration.

### Current Flow (Broken)
```
LLM → { input: "value" } → MCP Tool expecting { url: "value" } → ZodError
```

### Expected Flow (Fixed)
```
LLM → { url: "value" } → MCP Tool → Success
```

## Root Cause

The DynamicTool creation in MCPToolWrapper doesn't properly configure the schema, so the LLM doesn't know what parameters to send.

## Comprehensive Solution

### Option 1: Fix DynamicTool Schema Configuration (Recommended)

**File**: `packages/agent-engine/src/tools/MCPToolWrapper.ts`

```typescript
createLangChainTool(mcpTool: MCPTool): DynamicTool {
  const namespacedName = `${mcpTool.templateSlug}_${mcpTool.name}`.replace(/\./g, '_');
  
  // Convert JSON Schema to Zod schema for validation
  const zodSchema = this.jsonSchemaToZod(mcpTool.inputSchema);
  
  return new DynamicTool({
    name: namespacedName,
    description: this.enhanceDescription(mcpTool),
    schema: zodSchema, // ADD THIS - tells LLM about parameters
    func: async (input: any) => {
      const startTime = Date.now();
      
      try {
        // Log tool usage if enabled
        if (this.config.enableLogging) {
          console.log(`[MCPToolWrapper] Agent ${this.config.agentId} calling ${mcpTool.name} with:`, input);
        }
        
        // No need for special input processing - LLM will send correct format
        const validatedInput = zodSchema.parse(input);
        
        // Execute the tool via gateway
        const fullToolId = `${mcpTool.connectorId}:${mcpTool.name}`;
        const result = await this.config.gateway.invokeTool(
          this.config.starshipId,
          fullToolId,
          validatedInput
        );
        
        return this.formatToolResponse(result, mcpTool);
        
      } catch (error) {
        console.error(`[MCPToolWrapper] Error in ${mcpTool.name}:`, error);
        
        if (error instanceof z.ZodError) {
          return `Input validation failed: ${error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
        }
        
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
```

### Option 2: Add Intelligent Parameter Mapping (Fallback)

If Option 1 doesn't work with all LLM providers, add parameter mapping:

```typescript
private mapInputParameters(input: any, mcpTool: MCPTool): any {
  // If input is already correctly formatted, return as-is
  if (typeof input === 'object' && !input.hasOwnProperty('input')) {
    return input;
  }
  
  // Handle common single-parameter tools
  const properties = mcpTool.inputSchema?.properties || {};
  const propertyNames = Object.keys(properties);
  
  // Single parameter tool with generic input
  if (propertyNames.length === 1 && (typeof input === 'string' || input.input)) {
    const paramName = propertyNames[0];
    const value = typeof input === 'string' ? input : input.input;
    return { [paramName]: value };
  }
  
  // Try to map 'input' to the most likely parameter
  if (input.input && propertyNames.length > 0) {
    // Common parameter name mappings
    const mappings: Record<string, string[]> = {
      'url': ['url', 'uri', 'link', 'href', 'website'],
      'text': ['text', 'content', 'message', 'query', 'prompt'],
      'selector': ['selector', 'element', 'target'],
      'thought': ['thought', 'reasoning', 'analysis']
    };
    
    // Find best match
    for (const [key, aliases] of Object.entries(mappings)) {
      if (propertyNames.some(name => aliases.includes(name.toLowerCase()))) {
        const matchedParam = propertyNames.find(name => aliases.includes(name.toLowerCase()));
        return { [matchedParam!]: input.input };
      }
    }
  }
  
  // Return original if no mapping found
  return input;
}

// Then in the func:
func: async (input: any) => {
  try {
    // Map input parameters intelligently
    const mappedInput = this.mapInputParameters(input, mcpTool);
    
    if (this.config.enableLogging) {
      console.log(`[MCPToolWrapper] Mapped input:`, mappedInput);
    }
    
    const validatedInput = zodSchema.parse(mappedInput);
    // ... rest of execution
  }
}
```

### Option 3: Enhanced Tool Descriptions (Additional)

Update tool descriptions to include parameter hints:

```typescript
private enhanceDescription(tool: MCPTool): string {
  const categoryHints: Record<string, string> = {
    'sequentialthinking': '\nUse for: Complex reasoning, breaking down problems, systematic analysis',
    'memory': '\nUse for: Storing/retrieving context, maintaining state across conversations',
    'puppeteer': '\nUse for: Web automation, screenshots, data extraction from websites',
    'playwright': '\nUse for: Web browser automation, navigation, and interaction'
  };
  
  const hint = categoryHints[tool.templateSlug] || '';
  const provider = `\nProvider: ${tool.templateSlug}`;
  
  // Add parameter information
  let parameterInfo = '';
  if (tool.inputSchema?.properties) {
    const params = Object.entries(tool.inputSchema.properties)
      .map(([name, schema]: [string, any]) => {
        const required = tool.inputSchema.required?.includes(name) ? ' (required)' : ' (optional)';
        return `  - ${name}: ${schema.description || schema.type}${required}`;
      })
      .join('\n');
    
    if (params) {
      parameterInfo = `\n\nParameters:\n${params}`;
    }
  }
  
  return `${tool.description}${hint}${parameterInfo}${provider}`;
}
```

## Expected Behavior After Fix

### 1. Immediate Impact
- All MCP tools will start working correctly
- No more ZodError validation failures
- Proper parameter passing between LLM and tools

### 2. Tool Execution Examples

**Web Navigation (Playwright)**:
- Before: `{ input: "https://example.com" }` → ❌ ZodError
- After: `{ url: "https://example.com" }` → ✅ Success

**Sequential Thinking**:
- Before: `{ input: "analyze this" }` → ❌ ZodError
- After: `{ thought: "...", nextThoughtNeeded: true, ... }` → ✅ Success

**Memory Storage**:
- Before: `{ input: "store this" }` → ❌ ZodError
- After: `{ key: "...", value: "..." }` → ✅ Success

### 3. User Experience
- Agents will successfully navigate websites
- Sequential thinking will complete all iterations
- Memory operations will work correctly
- No more "Processing your request..." stuck states

## Implementation Steps

1. **Immediate Fix** (Option 1):
   - Add `schema` property to DynamicTool
   - Test with a simple tool first
   - Roll out to all tools

2. **Robust Solution** (Option 1 + 2):
   - Implement schema configuration
   - Add parameter mapping as fallback
   - Enhanced error messages

3. **Complete Solution** (All Options):
   - Schema configuration
   - Parameter mapping
   - Enhanced descriptions
   - Comprehensive testing

## Testing Plan

```typescript
// Test cases to verify fix
describe('MCP Tool Parameter Fix', () => {
  it('should handle web navigation correctly', async () => {
    const result = await agent.execute('Navigate to https://example.com');
    expect(result).not.toContain('ZodError');
    expect(result).toContain('Navigated successfully');
  });
  
  it('should handle sequential thinking', async () => {
    const result = await agent.execute('Analyze the impact of AI');
    expect(result).toContain('Thought 1');
    expect(result).toContain('Thought 7');
  });
  
  it('should handle memory operations', async () => {
    const result = await agent.execute('Remember that my favorite color is blue');
    expect(result).toContain('Stored successfully');
  });
});
```

## Rollback Plan

If the fix causes issues:
1. Remove schema property from DynamicTool
2. Implement only parameter mapping (Option 2)
3. Monitor and adjust mapping rules

## Success Metrics

- **Tool Success Rate**: > 95% (from current 0%)
- **Parameter Validation Errors**: < 1%
- **User Task Completion**: > 90%

## Timeline

- **Hour 1**: Implement Option 1 (schema fix)
- **Hour 2**: Test with all tool types
- **Hour 3**: Add Option 2 (parameter mapping) if needed
- **Hour 4**: Deploy and monitor

This fix will restore full MCP functionality across the entire system.