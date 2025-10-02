# Tool Form Drawer Integration

This document explains how to use the tool form drawer feature for creating tools with Daedalus or other agents.

## Overview

The tool form drawer provides a UI for creating custom tools during conversations. It can be controlled programmatically by agents like Daedalus to guide users through the tool creation process.

## Components

### 1. ToolFormDrawer

The main drawer component that displays the tool creation form.

**Location:** [`packages/client/src/components/conversation/ToolFormDrawer.tsx`](./ToolFormDrawer.tsx)

**Features:**

- Form fields for tool name, description, category, example usage
- JSON editors for parameters schema and blueprint
- API key requirement checkbox
- Form validation
- Category selection with visual icons
- Matches AgentDetailsDrawer styling

**Ref Methods:**

```typescript
interface ToolFormDrawerRef {
  updateField: (field: keyof ToolFormData, value: string | boolean) => void
  getFormData: () => ToolFormData
  resetForm: () => void
}
```

### 2. Tool Form Controller

Provides programmatic control over the drawer.

**Location:** [`packages/client/src/lib/tool-form-controller.ts`](../../lib/tool-form-controller.ts)

**API:**

```typescript
import { openToolFormDrawer, populateToolForm, openAndPopulateToolForm } from '@/lib/tool-form-controller'

// Open the drawer
openToolFormDrawer()

// Populate form fields
populateToolForm({
  name: 'Weather Lookup',
  description: 'Get current weather for any city',
  category: 'data',
  exampleUsage: 'getWeather({ city: "San Francisco" })',
  requiresApiKey: true,
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City name'
      }
    },
    required: ['city']
  },
  blueprint: {
    nodes: [...],
    edges: [...]
  }
})

// Or do both in one call
openAndPopulateToolForm({
  name: 'Weather Lookup',
  description: 'Get current weather for any city',
  // ... other fields
})
```

## Usage Flow

### For Daedalus Agent

When a user asks Daedalus to create a tool, the flow should be:

1. **User Request:**

   ```
   User: "Hey Daedalus, can you help me create a weather tool?"
   ```

2. **Daedalus Opens Drawer:**

   ```typescript
   // In agent code or via message handling
   import { openToolFormDrawer } from '@/lib/tool-form-controller'
   openToolFormDrawer()
   ```

3. **Daedalus Populates Fields:**

   ```typescript
   import { populateToolForm } from '@/lib/tool-form-controller'

   populateToolForm({
     name: 'Weather Lookup',
     description: 'Fetches current weather data for any city using OpenWeather API',
     category: 'data',
     exampleUsage: 'Use this tool to get temperature, humidity, and conditions for a specific city',
     requiresApiKey: true,
     parameters: {
       type: 'object',
       properties: {
         city: { type: 'string', description: 'City name' },
         units: { type: 'string', description: 'Temperature units (metric/imperial)', enum: ['metric', 'imperial'] },
       },
       required: ['city'],
     },
     blueprint: {
       nodes: [
         { id: 'start', type: 'Start', position: { x: 0, y: 0 }, parameters: {} },
         {
           id: 'http',
           type: 'HttpRequest',
           position: { x: 200, y: 0 },
           parameters: {
             url: 'https://api.openweathermap.org/data/2.5/weather',
             method: 'GET',
           },
         },
         { id: 'end', type: 'End', position: { x: 400, y: 0 }, parameters: {} },
       ],
       edges: [
         { source: 'start', target: 'http' },
         { source: 'http', target: 'end' },
       ],
     },
   })
   ```

4. **User Reviews and Modifies:**

   ```
   User: "Can you change the description to be more specific?"
   ```

5. **Daedalus Updates Field:**

   ```typescript
   import { getToolFormController } from '@/lib/tool-form-controller'

   const controller = getToolFormController()
   controller?.updateField('description', 'Real-time weather data including temperature, humidity, wind speed, and conditions')
   ```

6. **User Saves:**
   The user clicks "Save Tool" button, which triggers validation and submission.

## Available Categories

- `general` - General-purpose tools
- `automation` - Workflow automation tools
- `data` - Data processing and analysis
- `communication` - Communication and messaging
- `coding` - Programming and development tools
- `creative` - Content creation and artistic tools
- `analysis` - Data analysis and insights tools
- `support` - Customer service and help tools
- `utility` - Utility and helper tools

## Form Fields

### Required Fields

- **name**: Tool name
- **description**: Tool description

### Optional Fields

- **category**: Tool category (default: 'general')
- **exampleUsage**: Example of how to use the tool
- **requiresApiKey**: Whether the tool requires API credentials
- **parameters**: JSON schema for tool parameters
- **blueprint**: Workflow blueprint (nodes and edges)

## Parameter Schema Format

The parameters field expects a JSON object following this structure:

```json
{
  "type": "object",
  "properties": {
    "paramName": {
      "type": "string|number|boolean|object|array",
      "description": "Parameter description",
      "enum": ["option1", "option2"] // Optional for string types
    }
  },
  "required": ["paramName"] // Optional array of required parameter names
}
```

## Blueprint Format

The blueprint field expects a workflow definition:

```json
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "Start|End|HttpRequest|LLM|Transform|etc",
      "position": { "x": 0, "y": 0 },
      "parameters": {}
    }
  ],
  "edges": [
    {
      "source": "node-id",
      "target": "node-id"
    }
  ]
}
```

## Example: Full Tool Creation

```typescript
import { openAndPopulateToolForm } from '@/lib/tool-form-controller'

openAndPopulateToolForm({
  name: 'GitHub Issue Creator',
  description: 'Creates a new issue in a GitHub repository',
  category: 'automation',
  exampleUsage: 'createGitHubIssue({ repo: "owner/repo", title: "Bug report", body: "Description" })',
  requiresApiKey: true,
  parameters: {
    type: 'object',
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in format owner/repo',
      },
      title: {
        type: 'string',
        description: 'Issue title',
      },
      body: {
        type: 'string',
        description: 'Issue body/description',
      },
      labels: {
        type: 'array',
        description: 'Array of label names',
        items: { type: 'string' },
      },
    },
    required: ['repo', 'title'],
  },
  blueprint: {
    nodes: [
      { id: 'start', type: 'Start', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'create-issue',
        type: 'HttpRequest',
        position: { x: 200, y: 0 },
        parameters: {
          url: 'https://api.github.com/repos/{{ input.repo }}/issues',
          method: 'POST',
          headers: {
            Authorization: 'Bearer {{ config.githubToken }}',
            Accept: 'application/vnd.github+json',
          },
          body: {
            title: '{{ input.title }}',
            body: '{{ input.body }}',
            labels: '{{ input.labels }}',
          },
        },
      },
      { id: 'end', type: 'End', position: { x: 400, y: 0 }, parameters: { output: '{{ create-issue.output }}' } },
    ],
    edges: [
      { source: 'start', target: 'create-issue' },
      { source: 'create-issue', target: 'end' },
    ],
  },
})
```

## Integration Points

### ConversationInterface

The drawer is integrated into [`ConversationInterface.tsx`](./ConversationInterface.tsx:257-263) and is available throughout conversations.

### Event Handling
