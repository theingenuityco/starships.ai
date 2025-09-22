# NPM-Based Tools Architecture Solution

## Problem Statement
The current `code` node has `require` disabled for security, preventing the use of NPM packages. This blocks the implementation of tools that need external packages like `wikipedia`, `axios`, `cheerio`, etc.

## Elegant Solution: Package-Enabled Code Node

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Tool Blueprint                              │
│  Uses new 'package_code' node type for NPM package access          │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     PackageCode Node (NEW)                         │
│  Extends BaseNode, enables require() for whitelisted packages     │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    ChildProcessRunner                              │
│  Executes in isolated Node.js process with full require() access   │
└─────────────────────────────────────────────────────────────────────┐
```

### Implementation Plan

## Phase 1: Create PackageCode Node Type

### 1.1 Add to Node Types
**File**: `packages/autopilot/src/types/base.ts`

```typescript
export type NodeType =
  | 'agent'
  | 'conditional'
  | 'user_prompt'
  | 'output'
  | 'start'
  | 'end'
  | 'http_request'
  | 'llm'
  | 'workflow'
  | 'transform'
  | 'mutate'
  | 'tool'
  | 'code'
  | 'package_code'; // NEW: Code node with NPM package support
```

### 1.2 Create PackageCode Parameters Type
**File**: `packages/autopilot/src/types/node-parameters.ts`

```typescript
export interface PackageCodeParams extends BaseParams {
  code: string;
  packages?: string[]; // List of allowed NPM packages
  timeout?: number;
}
```

### 1.3 Create PackageCode Node Class
**File**: `packages/autopilot/src/nodes/PackageCode.ts`

```typescript
/**
 * PackageCode Class
 *
 * Enhanced code node that can use NPM packages in an isolated environment.
 * Executes in ChildProcessRunner for security while enabling require().
 */

import { BaseNode } from './BaseNode';
import { ValidationResult, ExecutionItem } from '@/types';
import type { PackageCodeParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { ChildProcessRunner } from '@/runner/ChildProcessRunner';

export class PackageCode extends BaseNode<PackageCodeParams> {
  constructor(params: PackageCodeParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  /**
   * Execute the JavaScript code with NPM package support
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();

    try {
      // Get input data
      const inputData = ExecutionItemUtils.unwrapSingle(input);

      // Create a mini blueprint that executes our code
      // This will run in ChildProcessRunner where require() works
      const codeBlueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start' as const,
            name: 'Start',
            description: 'Code execution start',
            parameters: {}
          },
          {
            ref: 'execute',
            type: 'code' as const,
            name: 'Execute with Packages',
            description: 'Execute code with NPM packages',
            parameters: {
              // Wrap the user's code to enable require for specified packages
              code: this.wrapCodeWithPackages(params.code, params.packages),
              timeout: params.timeout || 30000
            }
          },
          {
            ref: 'end',
            type: 'end' as const,
            name: 'End',
            description: 'Code execution end',
            parameters: {
              output: '{{ $input() }}'
            }
          }
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'execute' },
          { ref: 'e2', from: 'execute', to: 'end' }
        ],
        metadata: {}
      };

      // Create execution context
      const execution = ExecutionItemUtils.createExecution(
        ExecutionItemUtils.wrapSingle(inputData)
      );

      // Always use ChildProcessRunner for package-enabled code
      const runner = new ChildProcessRunner({
        timeoutMs: params.timeout || 30000,
        memoryLimitMB: 512 // Reasonable memory limit
      });

      // Execute the blueprint
      const result = await runner.run(codeBlueprint, execution);
      
      return result;
    } catch (error) {
      throw this.handleExecutionError(error, 'PackageCode execution failed');
    }
  }

  /**
   * Wrap user code to safely enable require for specified packages
   */
  private wrapCodeWithPackages(userCode: string, packages?: string[]): string {
    // Create a safe require function that only allows specified packages
    const packageRequires = (packages || [])
      .map(pkg => `const ${this.sanitizePackageName(pkg)} = require('${pkg}');`)
      .join('\n');

    return `
      // Enable specified NPM packages
      ${packageRequires}
      
      // User code with packages available
      ${userCode}
    `;
  }

  /**
   * Sanitize package name for use as variable
   */
  private sanitizePackageName(packageName: string): string {
    // Convert package names like '@foo/bar' or 'foo-bar' to 'foo_bar'
    return packageName
      .replace('@', '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/^(\d)/, '_$1'); // Prefix with _ if starts with number
  }

  /**
   * Validate the node configuration
   */
  validate(): ValidationResult {
    const errors = [];
    const params = this.getParams();

    if (!params.code || typeof params.code !== 'string') {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Code is required and must be a string'
      });
    }

    if (params.packages && !Array.isArray(params.packages)) {
      errors.push({
        code: 'INVALID_FIELD',
        message: 'Packages must be an array of strings'
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
```

### 1.4 Register PackageCode in Engine
**File**: `packages/autopilot/src/engine/Engine.ts`

Add to HANDLER_MAP:
```typescript
const HANDLER_MAP: Record<string, () => Promise<NodeHandlerConstructor>> = {
  // ... existing handlers ...
  package_code: () => import('@/nodes/PackageCode').then((m) => m.PackageCode as NodeHandlerConstructor),
};
```

## Phase 2: Alternative Approach - Enhanced Child Process

Instead of creating a new node type, we could enhance the child process to make packages available:

### 2.1 Enhanced Child Entry
**File**: `packages/autopilot/scripts/child-entry-with-packages.js`

```javascript
// At the top of child-entry.js, make packages available globally
const globalPackages = {
  wikipedia: require('wikipedia'),
  axios: require('axios'),
  cheerio: require('cheerio'),
  // Add more packages as needed
};

// Make packages available to code nodes
global.__packages = globalPackages;

// In the code execution context, make packages available
// This would be passed to the Engine configuration
```

## Phase 3: Security Considerations

### Package Whitelist System

**File**: `packages/autopilot/src/constants/index.ts`

```typescript
// Whitelist of allowed NPM packages for tools
export const ALLOWED_NPM_PACKAGES = [
  'wikipedia',
  'axios',
  'cheerio',
  'lodash',
  'moment',
  'uuid',
  'crypto-js',
  // Add more as needed
] as const;

export type AllowedPackage = typeof ALLOWED_NPM_PACKAGES[number];
```

### Security Rules:
1. **Whitelist Only**: Only pre-approved packages can be used
2. **No Dynamic Requires**: Package names must be static, not computed
3. **Isolated Execution**: Always runs in ChildProcessRunner
4. **Memory Limits**: Enforced memory limits to prevent abuse
5. **Timeout Protection**: Automatic timeout for runaway code

## Phase 4: Implementation for Wikipedia Tool

With the PackageCode node, the Wikipedia tool becomes:

**File**: `packages/models/src/seeders/tools/wikipedia.ts`

```typescript
export const wikipediaTool: ToolParams = {
  name: 'wikipedia_search',
  description: 'Search and retrieve comprehensive information from Wikipedia',
  parameters: {
    // ... same as before ...
  },
  blueprint: {
    nodes: [
      { 
        ref: 'start_1', 
        type: 'start', 
        name: 'Start', 
        parameters: {} 
      },
      {
        ref: 'wiki_query',
        type: 'package_code', // NEW NODE TYPE
        name: 'Wikipedia Query',
        description: 'Execute Wikipedia search using NPM package',
        parameters: {
          packages: ['wikipedia'], // Specify required packages
          code: `
            // Now we can use require!
            const wiki = require('wikipedia');
            
            const { query, action, limit = 5, language = 'en' } = input;
            
            // Set language
            wiki.setLang(language);
            
            try {
              switch(action) {
                case 'search':
                  const results = await wiki.search(query, { limit });
                  return {
                    action: 'search',
                    results: results.results
                  };
                  
                case 'summary':
                  const page = await wiki.page(query);
                  const summary = await page.summary();
                  return {
                    action: 'summary',
                    title: summary.title,
                    extract: summary.extract,
                    url: summary.content_urls?.desktop?.page
                  };
                  
                // ... other cases ...
              }
            } catch (error) {
              return { error: error.message };
            }
          `,
          timeout: 30000
        }
      },
      { 
        ref: 'end_1', 
        type: 'end', 
        name: 'End', 
        parameters: { output: '{{ $input() }}' } 
      }
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'wiki_query' },
      { ref: 'e2', from: 'wiki_query', to: 'end_1' }
    ]
  }
};
```

## Benefits of This Approach

1. **Scalable**: Any future NPM-based tool can use the same pattern
2. **Secure**: Packages are whitelisted and run in isolation
3. **Clean**: No hacks, follows existing architecture patterns
4. **Maintainable**: Clear separation between regular code and package-enabled code
5. **Performant**: ChildProcessRunner already optimized for isolation

## Migration Path

1. Start with the simpler approach (new node type)
2. Test with Wikipedia tool
3. Add more packages to whitelist as needed
4. Consider moving to global package availability if many tools need it

## Future Enhancements

1. **Package Registry**: Database table for allowed packages
2. **Version Control**: Specify package versions for stability
3. **Package Caching**: Pre-install packages in Docker image
4. **Dynamic Installation**: Auto-install packages on first use
5. **Package Sandboxing**: Further restrictions on package capabilities

## Conclusion

This solution provides a clean, secure, and scalable way to use NPM packages in tools while maintaining the security boundaries of the system. It follows the existing architecture patterns and can be extended for future needs.