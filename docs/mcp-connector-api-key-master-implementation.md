# MCP Connector API Key System - Master Implementation Guide

## 📋 Executive Summary

This document provides a complete implementation plan for adding API key management to MCP Connectors. The system automatically detects when connectors require API keys and provides a seamless UI for users to input them during connector selection.

**Key Features:**

- ✅ Auto-detection of API key requirements from existing data structures
- ✅ Seamless UI integration with existing ConnectorSelector
- ✅ Secure storage using existing `MCPServerConnector.env` field
- ✅ Zero breaking changes to current architecture
- ✅ Compatible with all current and future connectors

---

## 📊 Live Implementation Progress Tracker

### Overall Progress: 17.5% Complete (7/40 tasks)

```
Phase 1: Core Infrastructure     [██████████] 10/10 tasks (100%) ✅ COMPLETE
Phase 2: UI Integration         [░░░░░░░░░░] 0/10 tasks (0%) ⏳ IN PROGRESS
Phase 3: Advanced Features     [░░░░░░░░░░] 0/8 tasks (0%)
Phase 4: Testing & Polish      [░░░░░░░░░░] 0/12 tasks (0%)
```

### 🎯 Current Sprint Status

- **Active Phase**: Phase 2 - UI Integration
- **Current Day**: Day 4 - ConnectorSelector Enhancement
- **Next Milestone**: Complete UI integration with API key support
- **Estimated Completion**: 7 days remaining

---

## 🏗️ System Architecture Overview

### Current System Analysis

**Existing Components:**

- **MCPServerOption**: Template definitions with `env` field containing environment variables
- **MCPServerConnector**: Instance of a connector deployed on a starship with configuration
- **ConnectorSelector**: UI component for selecting and managing connectors
- **ConnectorInstanceConfig**: Configuration management for connector instances

### API Key Requirements Analysis

From current seed data, these connectors require API keys:

| Connector    | Required Keys                  | Pattern           | Example Value         |
| ------------ | ------------------------------ | ----------------- | --------------------- |
| GitHub       | `GITHUB_PERSONAL_ACCESS_TOKEN` | `Github_API_key`  | `ghp_xxxx...`         |
| Notion       | `OPENAPI_MCP_HEADERS`          | `Notion_API_Key`  | `secret_xxx...`       |
| Brave Search | `BRAVE_API_KEY`                | `Brave_API_Key`   | `BSA-xxx...`          |
| Slack        | `SLACK_BOT_TOKEN`              | `Slack_API_key`   | `xoxb-xxx...`         |
| Stripe       | `STRIPE_API_KEY`               | `Stripe_API_Key`  | `sk_xxx...`           |
| PostgreSQL   | `POSTGRES_CONNECTION_STRING`   | Connection string | `postgresql://...`    |
| Google Drive | `GDRIVE_CREDENTIALS_PATH`      | File path         | `/path/to/creds.json` |
| Filesystem   | `FILESYSTEM_PATH`              | Directory path    | `/path/to/dir`        |

### Implementation Strategy

**Auto-Detection System**: Pattern-based recognition of API key requirements from placeholder values in the `env` field.

**Data Flow:**

1. **MCPServerOption** (Template) - Contains placeholder like `"Brave_API_Key"`
2. **User Input** - Provides actual API key via modal
3. **MCPServerConnector** (Instance) - Stores actual key in `env` field
4. **Runtime** - Uses resolved environment directly from connector
5. **UI Display** - Parses `env` field to show masked version for security

---

## 🔧 Complete Technical Implementation

### 1. Type Definitions

**File**: `packages/client/src/types/connector-api-keys.ts`

```typescript
export interface ApiKeyRequirement {
  envKey: string; // Environment variable name
  displayName: string; // User-friendly name
  type: 'api_key' | 'token' | 'connection_string' | 'file_path' | 'directory_path';
  placeholder: string; // Placeholder text for input
  required: boolean; // Whether this field is mandatory
  sensitive: boolean; // Whether to mask the input
  validation?: RegExp; // Optional validation pattern
  nestedKey?: string; // For complex JSON structures
  helpUrl?: string; // Documentation link
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ConnectorApiKeyState {
  requirements: ApiKeyRequirement[];
  values: Record<string, string>;
  validationResults: Record<string, ApiKeyValidationResult>;
  isSubmitting: boolean;
}
```

### 2. Core Detection and Management Utilities

**File**: `packages/client/src/lib/connector-api-keys.ts`

```typescript
export class ConnectorApiKeyManager {
  // Pattern matching for API key detection
  private static readonly API_KEY_PATTERNS = [
    /.*_API_[Kk]ey$/, // GitHub_API_key, Notion_API_Key
    /.*_TOKEN$/, // SLACK_BOT_TOKEN
    /.*_CONNECTION_STRING$/, // POSTGRES_CONNECTION_STRING
    /.*_PATH$/, // GDRIVE_CREDENTIALS_PATH, FILESYSTEM_PATH
  ];

  static detectRequirements(mcpOption: MCPServerOption): ApiKeyRequirement[] {
    if (!mcpOption.env) return [];

    try {
      const envVars = JSON.parse(mcpOption.env);
      const requirements: ApiKeyRequirement[] = [];

      for (const [envKey, value] of Object.entries(envVars)) {
        if (typeof value === 'string' && this.isPlaceholderValue(value)) {
          requirements.push(this.createRequirement(envKey, value));
        }

        // Handle nested JSON (like Notion headers)
        if (typeof value === 'string' && this.isJsonString(value)) {
          const nested = JSON.parse(value);
          for (const [nestedKey, nestedValue] of Object.entries(nested)) {
            if (typeof nestedValue === 'string' && this.isPlaceholderValue(nestedValue)) {
              requirements.push(this.createRequirement(envKey, nestedValue, nestedKey));
            }
          }
        }
      }

      return requirements;
    } catch (error) {
      console.warn('Failed to parse env field:', error);
      return [];
    }
  }

  private static isPlaceholderValue(value: string): boolean {
    return this.API_KEY_PATTERNS.some((pattern) => pattern.test(value));
  }

  private static isJsonString(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  private static createRequirement(
    envKey: string,
    placeholderValue: string,
    nestedKey?: string
  ): ApiKeyRequirement {
    const displayName = this.generateDisplayName(placeholderValue, nestedKey);
    const type = this.determineType(placeholderValue);

    return {
      envKey,
      displayName,
      type,
      placeholder: this.generatePlaceholder(type),
      required: true,
      sensitive: type !== 'file_path' && type !== 'directory_path',
      validation: this.getValidationPattern(type),
      nestedKey, // For complex structures like Notion headers
      helpUrl: this.getHelpUrl(envKey),
    };
  }

  private static generateDisplayName(placeholderValue: string, nestedKey?: string): string {
    if (nestedKey === 'Authorization') return 'API Key';

    // Extract service name from placeholder
    const serviceName = placeholderValue
      .replace(/_API_[Kk]ey$/, '')
      .replace(/_TOKEN$/, '')
      .replace(/_CONNECTION_STRING$/, '')
      .replace(/_PATH$/, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());

    if (placeholderValue.includes('TOKEN')) return `${serviceName} Token`;
    if (placeholderValue.includes('CONNECTION_STRING')) return `${serviceName} Connection String`;
    if (placeholderValue.includes('PATH')) return `${serviceName} Path`;
    return `${serviceName} API Key`;
  }

  private static determineType(placeholderValue: string): ApiKeyRequirement['type'] {
    if (placeholderValue.includes('TOKEN')) return 'token';
    if (placeholderValue.includes('CONNECTION_STRING')) return 'connection_string';
    if (placeholderValue.includes('CREDENTIALS_PATH')) return 'file_path';
    if (placeholderValue.includes('FILESYSTEM_PATH')) return 'directory_path';
    return 'api_key';
  }

  private static generatePlaceholder(type: ApiKeyRequirement['type']): string {
    switch (type) {
      case 'token':
        return 'xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx';
      case 'connection_string':
        return 'postgresql://user:password@host:5432/database';
      case 'file_path':
        return '/path/to/credentials.json';
      case 'directory_path':
        return '/path/to/directory';
      default:
        return 'sk-1234567890abcdefghijklmnopqrstuvwxyz123456';
    }
  }

  private static getValidationPattern(type: ApiKeyRequirement['type']): RegExp | undefined {
    switch (type) {
      case 'api_key':
        return /^[A-Za-z0-9_-]+$/;
      case 'token':
        return /^[A-Za-z0-9_-]+$/;
      case 'connection_string':
        return /^[a-zA-Z]+:\/\/.+/;
      case 'file_path':
        return /^\/.*\.(json|pem|key)$/;
      case 'directory_path':
        return /^\/.*[^\/]$/;
      default:
        return undefined;
    }
  }

  private static getHelpUrl(envKey: string): string | undefined {
    const key = envKey.toLowerCase();

    if (key.includes('github')) return 'https://github.com/settings/tokens';
    if (key.includes('notion')) return 'https://www.notion.so/my-integrations';
    if (key.includes('slack')) return 'https://api.slack.com/apps';
    if (key.includes('brave')) return 'https://api.search.brave.com';
    if (key.includes('stripe')) return 'https://dashboard.stripe.com/apikeys';

    return undefined;
  }

  // Utility methods for UI integration
  static validateApiKey(requirement: ApiKeyRequirement, value: string): boolean {
    if (!value.trim()) return false;
    if (requirement.validation) {
      return requirement.validation.test(value);
    }
    return true;
  }

  static maskApiKey(value: string, type: string): string {
    if (value.length <= 8) return '***';

    switch (type) {
      case 'connection_string':
        // Hide password in connection string
        return value.replace(/:([^:@]+)@/, ':***@');
      case 'file_path':
      case 'directory_path':
        return value; // Don't mask paths
      default:
        // Show first 3 and last 6 characters
        return `${value.substring(0, 3)}***${value.substring(value.length - 6)}`;
    }
  }

  static mergeApiKeysWithEnv(templateEnv: string, apiKeys: Record<string, string>): string {
    try {
      const envVars = JSON.parse(templateEnv);
      const resolvedEnv = { ...envVars };

      for (const [envKey, apiKeyValue] of Object.entries(apiKeys)) {
        if (envKey in resolvedEnv) {
          const originalValue = resolvedEnv[envKey];

          // Handle nested JSON structures (like Notion)
          if (typeof originalValue === 'string' && this.isJsonString(originalValue)) {
            const nested = JSON.parse(originalValue);
            // Find and replace placeholder values in nested structure
            for (const [nestedKey, nestedValue] of Object.entries(nested)) {
              if (typeof nestedValue === 'string' && this.isPlaceholderValue(nestedValue)) {
                nested[nestedKey] = apiKeyValue;
              }
            }
            resolvedEnv[envKey] = JSON.stringify(nested);
          } else {
            // Direct replacement
            resolvedEnv[envKey] = apiKeyValue;
          }
        }
      }

      return JSON.stringify(resolvedEnv);
    } catch (error) {
      console.error('Failed to merge API keys with env:', error);
      return templateEnv;
    }
  }
}
```

### 3. Validation Utilities

**File**: `packages/client/src/lib/api-key-validation.ts`

```typescript
import { ApiKeyRequirement, ApiKeyValidationResult } from '@/types/connector-api-keys';

export class ApiKeyValidator {
  static validate(requirement: ApiKeyRequirement, value: string): ApiKeyValidationResult {
    if (!value.trim()) {
      return { isValid: false, error: `${requirement.displayName} is required` };
    }

    if (requirement.validation && !requirement.validation.test(value)) {
      return {
        isValid: false,
        error: this.getValidationErrorMessage(requirement.type),
      };
    }

    // Additional service-specific validations
    const serviceValidation = this.validateServiceSpecific(requirement, value);
    if (!serviceValidation.isValid) {
      return serviceValidation;
    }

    return { isValid: true };
  }

  private static getValidationErrorMessage(type: ApiKeyRequirement['type']): string {
    switch (type) {
      case 'api_key':
        return 'API key format is invalid';
      case 'token':
        return 'Token format is invalid';
      case 'connection_string':
        return 'Connection string must be a valid URL';
      case 'file_path':
        return 'Must be a valid file path ending in .json, .pem, or .key';
      case 'directory_path':
        return 'Must be a valid directory path';
      default:
        return 'Invalid format';
    }
  }

  private static validateServiceSpecific(
    requirement: ApiKeyRequirement,
    value: string
  ): ApiKeyValidationResult {
    const envKey = requirement.envKey.toLowerCase();

    // GitHub token validation
    if (envKey.includes('github') && requirement.type === 'token') {
      if (!value.startsWith('ghp_') && !value.startsWith('github_pat_')) {
        return {
          isValid: false,
          error: 'GitHub tokens should start with "ghp_" or "github_pat_"',
        };
      }
    }

    // Slack token validation
    if (envKey.includes('slack') && requirement.type === 'token') {
      if (!value.startsWith('xoxb-')) {
        return {
          isValid: false,
          error: 'Slack bot tokens should start with "xoxb-"',
        };
      }
    }

    // Notion API key validation
    if (envKey.includes('notion') || requirement.displayName.includes('Notion')) {
      if (!value.startsWith('secret_')) {
        return {
          isValid: false,
          error: 'Notion API keys should start with "secret_"',
        };
      }
    }

    // Brave Search API key validation
    if (envKey.includes('brave')) {
      if (!value.startsWith('BSA-')) {
        return {
          isValid: false,
          error: 'Brave Search API keys should start with "BSA-"',
        };
      }
    }

    // Stripe API key validation
    if (envKey.includes('stripe')) {
      if (!value.startsWith('sk_') && !value.startsWith('pk_')) {
        return {
          isValid: false,
          error: 'Stripe API keys should start with "sk_" or "pk_"',
        };
      }
    }

    return { isValid: true };
  }
}
```

### 4. API Key Input Modal Component

**File**: `packages/client/src/components/crew/ApiKeyInputModal.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff, ExternalLink, Key } from 'lucide-react';
import { ApiKeyRequirement, ConnectorApiKeyState } from '@/types/connector-api-keys';
import { ApiKeyValidator } from '@/lib/api-key-validation';
import { MCPServerOption } from '@/lib/api';

interface ApiKeyInputModalProps {
  isOpen: boolean;
  connector: MCPServerOption;
  requirements: ApiKeyRequirement[];
  onSubmit: (apiKeys: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}

export function ApiKeyInputModal({
  isOpen,
  connector,
  requirements,
  onSubmit,
  onCancel
}: ApiKeyInputModalProps) {
  const [state, setState] = useState<ConnectorApiKeyState>({
    requirements,
    values: {},
    validationResults: {},
    isSubmitting: false
  });

  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setState({
        requirements,
        values: {},
        validationResults: {},
        isSubmitting: false
      });
      setShowValues({});
    }
  }, [isOpen, requirements]);

  const handleValueChange = (envKey: string, value: string) => {
    const requirement = requirements.find(r => r.envKey === envKey);
    if (!requirement) return;

    const validationResult = ApiKeyValidator.validate(requirement, value);

    setState(prev => ({
      ...prev,
      values: { ...prev.values, [envKey]: value },
      validationResults: { ...prev.validationResults, [envKey]: validationResult }
    }));
  };

  const toggleShowValue = (envKey: string) => {
    setShowValues(prev => ({ ...prev, [envKey]: !prev[envKey] }));
  };

  const isFormValid = () => {
    return requirements.every(req => {
      const result = state.validationResults[req.envKey];
      return result?.isValid === true;
    });
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;

    setState(prev => ({ ...prev, isSubmitting: true }));

    try {
      await onSubmit(state.values);
    } catch (error) {
      console.error('Failed to submit API keys:', error);
      // Handle error - could show toast or error state
    } finally {
      setState(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Configure {connector.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This connector requires API keys to function properly.
          </p>

          {requirements.map((requirement) => {
            const value = state.values[requirement.envKey] || '';
            const validation = state.validationResults[requirement.envKey];
            const isVisible = showValues[requirement.envKey];

            return (
              <div key={requirement.envKey} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={requirement.envKey} className="text-sm font-medium">
                    {requirement.displayName}
                    {requirement.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {requirement.helpUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-1 text-xs"
                      onClick={() => window.open(requirement.helpUrl, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Get Key
                    </Button>
                  )}
                </div>

                <div className="relative">
                  <Input
                    id={requirement.envKey}
                    type={requirement.sensitive && !isVisible ? 'password' : 'text'}
                    value={value}
                    onChange={(e) => handleValueChange(requirement.envKey, e.target.value)}
                    placeholder={requirement.placeholder}
                    className={validation && !validation.isValid ? 'border-red-500' : ''}
                  />
                  {requirement.sensitive && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-auto p-1"
                      onClick={() => toggleShowValue(requirement.envKey)}
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>

                {validation && !validation.isValid && (
                  <p className="text-xs text-red-500">{validation.error}</p>
                )}
              </div>
            );
          })}

          {requirements.length === 0 && (
            <Alert>
              <AlertDescription>
                No API keys required for this connector.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onCancel} disabled={state.isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid() || state.isSubmitting}
          >
            {state.isSubmitting ? 'Connecting...' : 'Connect'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 📅 Step-by-Step Implementation Guide

### Phase 1: Core Infrastructure (Days 1-3)

#### Day 1: Type Definitions and Utilities - Status: ✅ Complete

**Tasks Progress: 4/4 Complete**

1. ✅ Create type definitions file
2. ✅ Implement ConnectorApiKeyManager class
3. ✅ Add pattern detection logic
4. ✅ Create validation utilities

**Estimated Time**: 6-8 hours
**Dependencies**: None
**Deliverables**:

- [x] `packages/client/src/types/connector-api-keys.ts`
- [x] `packages/client/src/lib/connector-api-keys.ts`
- [x] `packages/client/src/lib/api-key-validation.ts`
- [x] Pattern detection working for all connector types

**File Creation Commands:**

```bash
# Create directories
mkdir -p packages/client/src/types
mkdir -p packages/client/src/lib

# Create core files
touch packages/client/src/types/connector-api-keys.ts
touch packages/client/src/lib/connector-api-keys.ts
touch packages/client/src/lib/api-key-validation.ts
```

#### Day 2: API Key Input Modal - Status: ✅ Complete

**Tasks Progress: 5/5 Complete**

1. ✅ Build responsive modal component
2. ✅ Add form validation and error handling
3. ✅ Implement password visibility toggle
4. ✅ Add help links for each service
5. ✅ Handle loading states and error display

**Estimated Time**: 8-10 hours
**Dependencies**: Day 1 complete
**Deliverables**:

- [x] `packages/client/src/components/crew/ApiKeyInputModal.tsx`
- [x] Fully functional modal with validation
- [x] Integration with existing UI components

**File Creation Commands:**

```bash
# Create modal component
touch packages/client/src/components/crew/ApiKeyInputModal.tsx
```

#### Day 3: Testing Core Components - Status: ✅ Complete

**Tasks Progress: 4/4 Complete**

1. ✅ Unit tests for detection utilities
2. ✅ Unit tests for validation logic
3. ✅ Component tests for modal
4. ✅ Integration tests for core flow

**Estimated Time**: 6-8 hours
**Dependencies**: Day 2 complete
**Deliverables**:

- [x] Complete test coverage for core utilities
- [x] Modal component tests
- [x] Integration test scenarios

**File Creation Commands:**

```bash
# Create test files
mkdir -p packages/client/src/lib/__tests__
mkdir -p packages/client/src/components/crew/__tests__

touch packages/client/src/lib/__tests__/connector-api-keys.test.ts
touch packages/client/src/lib/__tests__/api-key-validation.test.ts
touch packages/client/src/components/crew/__tests__/ApiKeyInputModal.test.tsx
```

### Phase 2: UI Integration (Days 4-6)

#### Day 4: ConnectorSelector Enhancement - Status: ⏳ In Progress

**Tasks Progress: 0/4 Complete**

1. ❌ Add API key detection to connector rendering
2. ❌ Implement visual indicators (🔑, ⚠️, ✅)
3. ❌ Add modal trigger logic
4. ❌ Update connector creation flow

**Estimated Time**: 8-10 hours
**Dependencies**: Day 3 complete
**Deliverables**:

- [ ] Enhanced ConnectorSelector with API key support
- [ ] Visual indicators working
- [ ] Modal integration complete

#### Day 5: Status Display Integration - Status: ⏳ Pending

**Tasks Progress: 0/4 Complete**

1. ❌ Add API key status to ConnectorStatusDashboard
2. ❌ Update ConnectorInstanceMonitor with key status
3. ❌ Implement masked key display in UI
4. ❌ Add configuration status indicators

**Estimated Time**: 6-8 hours
**Dependencies**: Day 4 complete
**Deliverables**:

- [ ] Status dashboard shows API key configuration
- [ ] Masked display for security
- [ ] Clear status indicators

#### Day 6: Error Handling & UX Polish - Status: ⏳ Pending

**Tasks Progress: 0/4 Complete**

1. ❌ Add comprehensive error messages
2. ❌ Implement retry mechanisms
3. ❌ Add loading states throughout flow
4. ❌ Test complete user journey

**Estimated Time**: 6-8 hours
**Dependencies**: Day 5 complete
**Deliverables**:

- [ ] Robust error handling
- [ ] Smooth user experience
- [ ] Complete flow testing

### Phase 3: Advanced Features (Days 7-8)

#### Day 7: Key Management Integration - Status: ⏳ Pending

**Tasks Progress: 0/4 Complete**

1. ❌ Add API key management to existing config modal
2. ❌ Implement key rotation functionality
3. ❌ Add configuration history tracking
4. ❌ Create key export/import features

**Estimated Time**: 8-10 hours
**Dependencies**: Day 6 complete
**Deliverables**:

- [ ] Enhanced ConnectorInstanceConfig component
- [ ] Key management features
- [ ] Configuration history

#### Day 8: Security & Performance - Status: ⏳ Pending

**Tasks Progress: 0/4 Complete**

1. ❌ Implement secure clipboard handling
2. ❌ Add input sanitization
3. ❌ Optimize detection performance
4. ❌ Add caching for validation results

**Estimated Time**: 6-8 hours
**Dependencies**: Day 7 complete
**Deliverables**:

- [ ] Security hardening complete
- [ ] Performance optimized
- [ ] Caching implemented

### Phase 4: Testing & Documentation (Days 9-10)

#### Day 9: Comprehensive Testing - Status: ⏳ Pending

**Tasks Progress: 0/4 Complete**

1. ❌ Integration tests for complete flow
2. ❌ E2E tests for user journeys
3. ❌ Error handling and recovery tests
4. ❌ Performance benchmarks

**Estimated Time**: 8-10 hours
**Dependencies**: Day 8 complete
**Deliverables**:

- [ ] Complete test suite
- [ ] E2E test scenarios
- [ ] Performance benchmarks

**File Creation Commands:**

```bash
# Create integration and E2E tests
touch packages/client/src/components/crew/__tests__/ConnectorSelector.integration.test.tsx
mkdir -p packages/client/cypress/e2e
touch packages/client/cypress/e2e/connector-api-keys.cy.ts
```

#### Day 10: Documentation & Polish - Status: ⏳ Pending

**Tasks Progress: 0/5 Complete**

1. ❌ Update component documentation
2. ❌ Create usage examples
3. ❌ Add troubleshooting guide
4. ❌ Performance optimization
5. ❌ Final bug fixes

**Estimated Time**: 4-6 hours
**Dependencies**: Day 9 complete
**Deliverables**:

- [ ] Complete documentation
- [ ] Usage examples
- [ ] Troubleshooting guide
- [ ] Production ready

---

## 🎯 Concrete Example: Brave Search Connector

### Current MCPServerOption Node

```json
{
  "id": "brave-search-uuid-123",
  "name": "Brave Search",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-brave-search"],
  "env": "{\"BRAVE_API_KEY\": \"Brave_API_Key\"}"
}
```

### User Flow Example

1. **User selects Brave Search** → System detects `"Brave_API_Key"` placeholder
2. **Modal appears** → User enters actual API key: `BSA-abc123def456ghi789jkl012mno345pqr678`
3. **Validation passes** → System creates MCPServerConnector with resolved env
4. **Result stored**:

```json
{
  "id": "connector-instance-brave-uuid-456",
  "starshipId": "starship-alpha-123",
  "templateId": "brave-search-uuid-123",
  "env": "{\"BRAVE_API_KEY\": \"BSA-abc123def456ghi789jkl012mno345pqr678\"}"
}
```

### UI Display After Configuration

```
┌─────────────────────────────────────────────────────────┐
│ ✅ Brave Search                                    🔑   │
│ NPX • CONFIGURED                                        │
│ API Key: BSA-***345pqr678                              │
│ Status: Active • Last used: 2 minutes ago              │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Implementation
