# Tool Form Drawer Integration

This document explains how the tool form drawer feature works for creating tools with Daedalus or other agents.

## Overview

The tool form drawer provides a UI for creating custom tools during conversations. It is controlled through SSE (Server-Sent Events) UI action events sent from the backend during agent tool execution.

## Components

### ToolFormDrawer

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

## How It Works

### Backend to Frontend Flow

1. **User Request:** "Hey Daedalus, can you help me create a weather tool?"

2. **Agent Calls Tool:** Daedalus calls `tool_create` with tool parameters

3. **Backend Emits SSE Event:** Server broadcasts a `ui_action` SSE event:

   ```typescript
   {
     __ui_action: 'tool_call_detected',
     toolName: 'tool_create',
     toolCallId: '...'
   }
   ```

4. **Frontend Opens Drawer:** [`ConversationInterface.tsx`](./ConversationInterface.tsx:190-202) receives the event and opens the drawer

5. **Stream Arguments:** As tool arguments stream in, the form fields are updated in real-time (lines 293-346)

6. **User Reviews and Saves:** User reviews the pre-populated form and clicks "Save Tool"

### SSE UI Actions

The system supports these UI action types:

- `tool_call_detected` - Opens the drawer when `tool_create` is called
- `open_tool_form` - Opens drawer with initial form data
- `update_tool_form` - Updates specific form fields
- `submit_tool_form` - Triggers form submission
- `close_tool_form` - Closes the drawer

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

## Integration Points

### ConversationInterface

The drawer is integrated into [`ConversationInterface.tsx`](./ConversationInterface.tsx) and handles:

1. **SSE Event Consumption** (lines 283-290): Listens to `lastUIAction` from `useConversationStreamed`
2. **Tool Argument Streaming** (lines 293-346): Updates form fields as tool arguments stream in
3. **Form State Management**: Controls drawer open/close state
4. **Form Submission**: Handles saving tool data via API

### Event Handling in handleUIPayload

Located at lines 169-265 in ConversationInterface.tsx, this function processes UI action events and controls the drawer accordingly.
