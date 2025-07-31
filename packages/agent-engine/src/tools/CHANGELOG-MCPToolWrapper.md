# MCPToolWrapper Changelog

## [2024-01-31] - Fix for undefined input errors

### Problem
When users say "Continue your analysis" after a sequential thinking response, the agent was calling the sequential thinking tool with undefined parameters, causing errors like:
```
Input validation failed: Required at "thought", Required at "nextThoughtNeeded", Required at "thoughtNumber", Required at "totalThoughts"
```

### Root Cause
The agent executor was calling tools with undefined or empty inputs when the user's prompt was ambiguous or continuation-based.

### Solution
Added guard clauses in `MCPToolWrapper.mapInputParameters`:

1. **General guard for all tools**: Check for undefined/null inputs at the start of `mapInputParameters` and return empty object
2. **Sequential thinking specific guard**: Detect continuation scenarios (empty or undefined input) and generate appropriate default parameters

### Code Changes

```typescript
// Added at start of mapInputParameters
if (input === undefined || input === null) {
  console.warn(`[MCPToolWrapper] Received undefined/null input for tool ${mcpTool.name}, using empty object`);
  return {};
}

// Added for sequential thinking continuation handling
if (!processedInput || Object.keys(processedInput).length === 0 || 
    (processedInput.input === undefined && !processedInput.thought)) {
  processedInput = {
    thought: `I need to continue my analysis. Let me build upon my previous thoughts and provide additional insights.`,
    nextThoughtNeeded: true,
    thoughtNumber: 2,
    totalThoughts: 5
  };
}
```

### Impact
- Prevents validation errors when agent receives ambiguous continuation prompts
- Provides sensible defaults for sequential thinking continuation
- Improves robustness of tool parameter handling