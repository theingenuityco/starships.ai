# Tool Form Drawer - Daedalus Integration

## Overview

The tool form drawer is now integrated with Daedalus's `tool_create` function, allowing seamless transitions between programmatic tool creation and interactive user review.

## How It Works

When Daedalus creates a tool, he can choose between two modes:

### 1. Direct Creation (Default)

```typescript
tool_create({
  name: 'Weather Lookup',
  slug: 'weather-lookup',
  description: 'Get weather for any city',
  parameters: {
    /* schema */
  },
  blueprint: {
    /* workflow */
  },
})
```

Creates the tool immediately via API.

### 2. Interactive Form

```typescript
tool_create({
  name: 'Weather Lookup',
  slug: 'weather-lookup',
  description: 'Get weather for any city',
  parameters: {
    /* schema */
  },
  blueprint: {
    /* workflow */
  },
  use_ui_form: true, // <-- Opens form for user review
})
```

Opens a drawer with the tool pre-filled for user review and modification.

## User Experience Flow

1. **User:** "Hey Daedalus, can you help me create a weather tool?"
2. **Daedalus:** Calls `tool_create()` with `use_ui_form: true`
3. **System:** Opens form drawer with Daedalus's suggested design
4. **User:** Reviews, modifies if needed, clicks "Save Tool"
5. **System:** Creates the tool and notifies user with toast

## Benefits

- **Natural Collaboration:** Daedalus designs, user reviews
- **Transparency:** Users see exactly what's being created
- **Flexibility:** Users can modify fields before creation
- **Learning:** Users understand tool structure through the form
- **No Rigid Scripts:** Daedalus decides when to use the form based on context

## Implementation Details

### Client Components

- [`ToolFormDrawer.tsx`](./src/components/conversation/ToolFormDrawer.tsx) - Form UI component
- [`tool-form-controller.ts`](./src/lib/tool-form-controller.ts) - Programmatic control
- [`ConversationInterface.tsx`](./src/components/conversation/ConversationInterface.tsx) - Integration point

### Backend Integration

- [`tool-create.ts`](../models/src/seeders/tools/tool-create.ts) - Enhanced tool with UI mode
- [`daedalus.ts`](../models/src/seeders/agents/daedalus.ts) - Updated agent instructions

### Key Features

- Form validates JSON syntax for parameters and blueprint
- Styled to match AgentDetailsDrawer
- Category selection with icons
- Real-time field updates
- Toast notifications on save

## Technical Flow

```
User Request
    ↓
Daedalus analyzes
    ↓
Daedalus calls tool_create(use_ui_form: true)
    ↓
Blueprint: start → check_ui_mode (conditional)
    ↓
    ├─ UI Mode: open_ui_form (code node) → end_ui
    └─ API Mode: prepare → http_create → end_api
    ↓
Form opens with pre-filled data
    ↓
User reviews/modifies
    ↓
User clicks "Save Tool"
    ↓
ConversationInterface.handleToolFormSave()
    ↓
Tool created via API
    ↓
Success toast displayed
```

## Daedalus Guidance

Daedalus's system prompt now states:

> "Design tools collaboratively using the available toolset. When creating tools, you can either create directly via API for straightforward cases or open an interactive form (use_ui_form: true) to let users review and modify your design. Choose the approach that best serves the user's needs and confidence level."

This gives Daedalus the flexibility to:

- Use direct creation for simple, well-understood tools
- Use interactive form when user involvement is beneficial
- Adapt to user's technical comfort level
- Learn from user preferences over time

## Example Conversation

```
User: Can you create a GitHub issue tool?

Daedalus: [Analyzes requirements]
Daedalus: [Calls tool_create with use_ui_form: true]
[Form opens with GitHub issue tool design]

User: Can you change the description?

[User can either:]
- Modify it directly in the form, OR
- Ask Daedalus (who would guide them to the form field)

User: [Clicks "Save Tool"]
[Toast: "GitHub Issue Creator has been created and is ready to use."]
```

## No Hardcoded Messages

The system is designed to be intuitive without rigid scripts:

- Daedalus naturally understands when to use the form
- Users naturally see and interact with the form
- Tool outputs are concise (success: true, mode: 'ui_form')
- The UI provides all necessary feedback (form, validation, toasts)

This creates a fluid, natural experience for both the agent and the user.

## SSE UI Action Event

- The server emits a dedicated SSE event type `ui_action` when a tool returns a payload like:
  - `{"__ui_action":"open_tool_form","formData":{...}}`
  - `{"__ui_action":"update_tool_form","patch":{...}}`
  - `{"__ui_action":"submit_tool_form"}`
  - `{"__ui_action":"close_tool_form"}`
- The client consumes `ui_action` alongside regular `message`/`delta` events to drive the Tool Form Drawer without polluting the chat stream.

This preserves a clean separation of concerns: chat remains conversational while UI actions are out-of-band.
