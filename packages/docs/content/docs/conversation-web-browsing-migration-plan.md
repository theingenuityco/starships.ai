# Conversation-Level Web Browsing Migration Plan

**Status:** 🟡 In Progress  
**Last Updated:** 2024-12-19  
**Goal:** Move web browsing toggle from agent-level to conversation-level while maintaining agent-level plugins as a fallback

---

## Overview

This migration moves web browsing control from agent configuration to conversation-level, providing users with per-conversation control over web browsing capabilities. Agent-level plugins remain as a backend fallback but are no longer exposed in the UI.

### Key Changes

- ✅ Remove web browsing toggle from agent builder UI
- ✅ Remove web browsing toggle from agent form UI
- ✅ Add web browsing toggle to conversation message input
- ✅ Update backend merge logic to prioritize conversation plugins
- ✅ Extend conversation update API to support state updates

---

## Phase 1: Backend - State Merging Logic

**Status:** 🔴 Not Started  
**Estimated Time:** 2-3 hours

### Task 1.1: Fix State Merge in `streamConversation`

**Status:** 🔴 Not Started  
**File:** `packages/server/src/services/ConversationService.ts`  
**Lines:** ~937-950

**Description:**
Update the state merging logic in `streamConversation` method to prioritize conversation-level plugins over agent-level plugins. **IMPORTANT:** Must preserve all other conversation state fields when merging.

**Current Code:**

```typescript
// Preserve plugins from agent state (for web browsing, etc.)
const plugins = (baseState as { plugins?: unknown }).plugins;
// ... later ...
state: {
  ...baseState,
  ...conversationState,
  tools: resolvedTools,
  starshipId: starship.id,
  // Preserve plugins from agent state if present
  ...(plugins !== undefined ? { plugins } : {}),  // This OVERRIDES conversation plugins!
},
```

**Required Change:**

```typescript
// Extract plugins with proper precedence: conversation > agent
// Use explicit undefined check (not nullish coalescing) to handle empty arrays correctly
const conversationPlugins = (conversationState as { plugins?: unknown })?.plugins;
const agentPlugins = (baseState as { plugins?: unknown })?.plugins;
const finalPlugins = conversationPlugins !== undefined ? conversationPlugins : agentPlugins;

// Merge state: baseState provides defaults, conversationState overrides, then we apply final plugins
state: {
  ...baseState,
  ...conversationState,  // Conversation state overrides agent state
  tools: resolvedTools,  // Always use resolved tools
  starshipId: starship.id,  // Always set starshipId
  // Apply plugins with proper precedence (conversation > agent)
  ...(finalPlugins !== undefined ? { plugins: finalPlugins } : {}),
},
```

**Key Points:**

- Empty array `[]` means "explicitly no plugins" (conversation wins)
- `undefined` means "not set" (fall back to agent)
- `null` should be treated as `undefined` for consistency
- All other conversation state fields are preserved via spread

**Acceptance Criteria:**

- [ ] Conversation plugins take precedence when both exist
- [ ] Agent plugins used as fallback when conversation has no plugins (undefined)
- [ ] Empty array in conversation means no plugins (explicit disable)
- [ ] Works correctly when neither has plugins
- [ ] Other conversation state fields are preserved
- [ ] Unit tests pass

---

### Task 1.2: Fix State Merge in `continueAfterToolApproval`

**Status:** 🔴 Not Started  
**File:** `packages/server/src/services/ConversationService.ts`  
**Lines:** ~1164-1177

**Description:**
Apply the same fix to the `continueAfterToolApproval` method to ensure consistency across all state merging paths. Must match the logic from Task 1.1 exactly.

**Current Code:**

```typescript
// Preserve plugins from agent state (for web browsing, etc.)
const plugins = baseState.plugins;
// ... later ...
...(plugins !== undefined ? { plugins } : {}),  // This OVERRIDES conversation plugins!
```

**Required Change:**

```typescript
// Check conversation plugins first, then fall back to agent plugins
// Use same logic as streamConversation for consistency
const conversationPlugins = (conversationState as { plugins?: unknown })?.plugins;
const agentPlugins = baseState.plugins;
const plugins = conversationPlugins !== undefined ? conversationPlugins : agentPlugins;
```

**Acceptance Criteria:**

- [ ] Same behavior as Task 1.1 (including empty array handling)
- [ ] Tool approval flow works correctly with conversation plugins
- [ ] Consistent merge logic across both methods
- [ ] Unit tests pass

---

### Task 1.3: Create Helper Function for Plugin Precedence

**Status:** 🔴 Not Started  
**File:** `packages/server/src/services/ConversationService.ts`

**Description:**
Create a private helper method to centralize the plugin precedence logic. This ensures consistency and makes the code more maintainable.

**Implementation:**

```typescript
/**
 * Resolve plugins with proper precedence: conversation > agent
 * @param conversationState - Conversation-level state
 * @param agentState - Agent-level state
 * @returns Resolved plugins (conversation if defined, otherwise agent, or undefined)
 */
private resolvePlugins(
  conversationState: Record<string, unknown> | undefined,
  agentState: Record<string, unknown> | undefined
): unknown[] | undefined {
  const conversationPlugins = (conversationState as { plugins?: unknown })?.plugins;
  const agentPlugins = (agentState as { plugins?: unknown })?.plugins;
  // Explicit undefined check (not nullish coalescing) to handle empty arrays correctly
  return conversationPlugins !== undefined ? conversationPlugins : agentPlugins;
}
```

**Usage:**
Replace manual plugin resolution in both `streamConversation` and `continueAfterToolApproval` with:

```typescript
const plugins = this.resolvePlugins(conversationState, baseState);
```

**Benefits:**

- Single source of truth for precedence logic
- Easier to test in isolation
- Easier to modify behavior in the future
- Consistent behavior across all merge points

**Acceptance Criteria:**

- [ ] Helper function created
- [ ] Function is private and well-documented
- [ ] Used in both merge locations
- [ ] Unit tests for helper function

---

### Task 1.4: Search for All State Merge Locations

**Status:** 🔴 Not Started  
**File:** `packages/server/src/services/ConversationService.ts`

**Description:**
Search the entire ConversationService for all locations where agent state and conversation state are merged. Ensure we fix ALL merge points, not just the two identified.

**Search For:**

- [ ] All occurrences of `conversationState` or `conversation.state`
- [ ] All occurrences of `baseState` or `agentModel.state`
- [ ] All places where `plugins` is extracted from state
- [ ] Any other state merging patterns

**Actions:**

- [ ] Document all merge locations found
- [ ] Verify all locations use the helper function (from Task 1.3)
- [ ] Add to task list if additional fixes needed

**Acceptance Criteria:**

- [ ] All state merge locations identified
- [ ] No merge locations missed
- [ ] All locations use consistent helper function
- [ ] All locations documented

---

### Task 1.5: Add Unit Tests for State Merging

**Status:** 🔴 Not Started  
**File:** `packages/server/src/services/__tests__/ConversationService.test.ts` (or create if needed)

**Description:**
Create comprehensive unit tests to verify the state merging logic works correctly in all scenarios.

**Test Cases:**

- [ ] Conversation has plugins, agent doesn't → conversation plugins used
- [ ] Agent has plugins, conversation doesn't (undefined) → agent plugins used
- [ ] Both have plugins → conversation plugins used (conversation wins)
- [ ] Neither has plugins → no plugins in final state
- [ ] Conversation plugins is empty array `[]` → empty array used (explicit disable, no plugins)
- [ ] Conversation plugins is `null` → treated as undefined, agent plugins used
- [ ] Agent plugins is empty array, conversation has plugins → conversation plugins used
- [ ] Agent plugins is empty array, conversation undefined → empty array used (agent explicit disable)
- [ ] Other conversation state fields preserved during merge

**Acceptance Criteria:**

- [ ] All test cases pass
- [ ] Test coverage > 80% for merge logic
- [ ] Tests are maintainable and well-documented

---

## Phase 2: Backend - API Layer

**Status:** 🔴 Not Started  
**Estimated Time:** 3-4 hours

### Task 2.1: Extend Conversation Update Schema

**Status:** 🔴 Not Started  
**File:** `packages/server/src/routes/conversations.ts`  
**Lines:** ~1337-1344

**Description:**
Update the Zod validation schema for conversation updates to accept `state` field with proper validation for plugins structure.

**Current Code:**

```typescript
z.object({
  title: z.string().min(1).max(100).optional(),
});
```

**Required Change:**

```typescript
z.object({
  title: z.string().min(1).max(100).optional(),
  state: z
    .object({
      plugins: z
        .array(
          z.object({
            id: z.string().min(1), // Require non-empty id
            max_results: z.number().int().positive().optional(), // Must be positive integer if provided
          })
        )
        .optional()
        .nullable(), // Allow null for explicit clearing
    })
    .passthrough()
    .optional(), // passthrough allows other state fields
});
```

**Validation Rules:**

- `plugins` can be: `undefined` (not set), `null` (explicit clear), `[]` (empty array = no plugins), or array of plugin objects
- Plugin `id` must be non-empty string
- `max_results` must be positive integer if provided
- Other state fields are allowed (passthrough) but not validated

**Acceptance Criteria:**

- [ ] Schema validates plugins structure correctly
- [ ] Rejects invalid plugin structures (invalid id, negative max_results, etc.)
- [ ] Allows partial state updates (only plugins, or plugins + other fields)
- [ ] Allows null to explicitly clear plugins
- [ ] Backward compatible (title-only updates still work)
- [ ] Other state fields can be included but aren't validated

---

### Task 2.2: Update ConversationService.updateConversation Method

**Status:** 🔴 Not Started  
**File:** `packages/server/src/services/ConversationService.ts`  
**Lines:** ~514-535

**Description:**
Extend the `updateConversation` method signature to accept `state` field and handle partial state merges.

**Current Code:**

```typescript
async updateConversation(conversationId: string, updates: { title?: string }): Promise<ConversationModel | null>
```

**Required Change:**

```typescript
async updateConversation(
  conversationId: string,
  updates: { title?: string; state?: Record<string, unknown> }
): Promise<ConversationModel | null>
```

**Implementation Notes:**

- When updating `state`, perform **shallow merge** with existing conversation state (don't replace entirely)
- Note: State structure is flat (plugins is top-level), so shallow merge is appropriate
- Preserve other state fields when updating plugins
- Handle null/undefined state gracefully
- If `state.plugins` is `null`, remove plugins from state (explicit clear)
- If `state.plugins` is `undefined`, don't change plugins (preserve existing)

**Implementation:**

```typescript
async updateConversation(
  conversationId: string,
  updates: { title?: string; state?: Record<string, unknown> }
): Promise<ConversationModel | null> {
  // ... existing code ...

  // If state is being updated, merge with existing state
  if (updates.state !== undefined) {
    const existing = await this.getConversationById(conversationId);
    const existingState = existing?.state || {};

    // Shallow merge: spread existing state, then spread updates
    // Special handling for plugins: null means remove, undefined means preserve
    const mergedState = { ...existingState, ...updates.state };

    // Handle explicit null: remove plugins from state (cleaner than delete after merge)
    if (updates.state.plugins === null) {
      const { plugins: _, ...rest } = mergedState;
      updates.state = rest;
    } else {
      updates.state = mergedState;
    }
  }

  // ... rest of update logic ...
}
```

**Acceptance Criteria:**

- [ ] Method accepts state parameter
- [ ] State updates merge correctly with existing state (shallow merge, appropriate for flat structure)
- [ ] Other state fields are preserved
- [ ] `null` plugins removes plugins from state
- [ ] `undefined` plugins preserves existing plugins
- [ ] Handles edge cases (null state, empty state, etc.)

---

### Task 2.3: Verify ConversationRepository Supports State Updates

**Status:** 🔴 Not Started  
**File:** `packages/models/src/repositories/ConversationRepository.ts`  
**Lines:** ~72-104

**Description:**
Verify that `ConversationRepository.update()` already supports state field updates (it should via `Partial<ConversationModel>`).

**Verification:**

- [ ] Review repository update method
- [ ] Confirm state field is not filtered out
- [ ] Test state update via repository directly
- [ ] Document if any changes needed

**Acceptance Criteria:**

- [ ] Repository accepts state in updates
- [ ] State is persisted to database correctly
- [ ] JSONB field is updated properly

---

### Task 2.4: Verify/Create GET Conversation Endpoint (if needed)

**Status:** 🔴 Not Started  
**File:** `packages/server/src/routes/conversations.ts`

**Description:**
Check if GET `/api/v1/conversations/:id` endpoint exists. If not, create it to fetch a single conversation with state. This is needed for frontend to read conversation state.

**Check:**

- [ ] Does GET `/conversations/:id` exist?
- [ ] Does it return full conversation model including state?
- [ ] Does it have proper authorization?

**If Missing, Create:**

```typescript
router.get('/conversations/:conversationId', jwtAuthMiddleware, async (req: Request, res: Response) => {
  // Validate conversationId
  // Check authorization
  // Fetch conversation via ConversationService.getConversationById()
  // Return full conversation model
});
```

**Acceptance Criteria:**

- [ ] Endpoint exists or is created
- [ ] Returns conversation with state field
- [ ] Proper authorization checks
- [ ] Returns 404 if not found
- [ ] Returns 403 if user doesn't have access

---

### Task 2.5: Add API Integration Tests

**Status:** 🔴 Not Started  
**File:** `packages/server/src/routes/__tests__/conversations.test.ts` (or create if needed)

**Description:**
Create integration tests for the conversation update endpoint with state updates.

**Test Cases:**

- [ ] GET /conversations/:id returns conversation with state
- [ ] PATCH /conversations/:id with state.plugins updates conversation
- [ ] PATCH /conversations/:id with invalid plugins structure returns 400
- [ ] PATCH /conversations/:id with state merges correctly (preserves other fields)
- [ ] PATCH /conversations/:id with state.plugins = null removes plugins
- [ ] PATCH /conversations/:id with title and state updates both
- [ ] Authorization checks work correctly

**Acceptance Criteria:**

- [ ] All integration tests pass
- [ ] Tests cover happy path and error cases
- [ ] Tests verify database persistence
- [ ] Tests verify state merging behavior

---

## Phase 3: Frontend - Remove Agent-Level Toggles

**Status:** 🔴 Not Started  
**Estimated Time:** 1-2 hours

### Task 3.1: Remove Web Browsing Toggle from AgentDocumentEditor

**Status:** 🔴 Not Started  
**File:** `packages/client/src/components/agents/AgentBuilder/components/AgentDocumentEditor.tsx`  
**Lines:** ~1820-1867

**Description:**
Remove the entire web browsing toggle section from the agent document editor component.

**Actions:**

- [ ] Remove the "Web Browsing" section (lines 1820-1867)
- [ ] Remove any related imports if no longer used
- [ ] Verify UI still renders correctly
- [ ] Check for any broken references

**Acceptance Criteria:**

- [ ] Toggle UI completely removed
- [ ] No console errors
- [ ] Agent builder still functions correctly
- [ ] No unused imports

---

### Task 3.2: Remove Web Browsing Toggle from AgentForm

**Status:** 🔴 Not Started  
**File:** `packages/client/src/components/agents/AgentForm.tsx`  
**Lines:** ~335-369

**Description:**
Remove the web browsing toggle from the agent form component.

**Actions:**

- [ ] Remove the "Web Browsing Toggle" section (lines 335-369)
- [ ] Remove related state handling if any
- [ ] Clean up any unused imports
- [ ] Verify form still works

**Acceptance Criteria:**

- [ ] Toggle UI completely removed
- [ ] Form submission still works
- [ ] No console errors
- [ ] Agent creation/editing unaffected

---

### Task 3.3: Verify Agent State Still Supports Plugins (Backend Compatibility)

**Status:** 🔴 Not Started  
**File:** Multiple files

**Description:**
Ensure that agent state can still contain plugins when set programmatically (via API), even though UI toggle is removed.

**Verification:**

- [ ] Agent API still accepts state.plugins
- [ ] Agent state with plugins is preserved
- [ ] Backend merge logic still uses agent plugins as fallback
- [ ] Document that agent plugins are now "API-only" feature

**Acceptance Criteria:**

- [ ] Agents can have plugins set via API
- [ ] Agent plugins work as fallback in conversations
- [ ] No breaking changes to agent API

---

## Phase 4: Frontend - Add Conversation-Level Toggle

**Status:** 🔴 Not Started  
**Estimated Time:** 4-5 hours

### Task 4.1: Verify/Create Conversation Detail Query Hook

**Status:** 🔴 Not Started  
**File:** `packages/client/src/hooks/useConversations.ts`

**Description:**
First, verify if there's a hook to fetch a single conversation by ID (including state). If not, create one. This is needed to read current conversation state for toggle initialization.

**Check:**

- [ ] Does `useConversationDetail(conversationId)` exist?
- [ ] Does it fetch conversation state?
- [ ] If missing, check if GET `/api/v1/conversations/:id` endpoint exists

**If Hook Missing, Create:**

```typescript
export function useConversationDetail(conversationId: string | null) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId!),
    queryFn: async (): Promise<ConversationModel> => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.get(`/api/v1/conversations/${conversationId}`);
      return response.data.data;
    },
    enabled: !!conversationId,
    staleTime: 30 * 1000, // 30 seconds
  });
}
```

**If Endpoint Missing:**

- Add GET `/api/v1/conversations/:id` endpoint in `packages/server/src/routes/conversations.ts`
- Return full conversation model including state

**Acceptance Criteria:**

- [ ] Hook exists or is created
- [ ] Fetches conversation with state field
- [ ] Properly typed
- [ ] Handles loading/error states

---

### Task 4.2: Create Conversation State Update Hook

**Status:** 🔴 Not Started  
**File:** `packages/client/src/hooks/useConversations.ts`  
**Lines:** ~295-336 (near existing `useUpdateConversation`)

**Description:**
Create a new React Query mutation hook for updating conversation state (specifically plugins). Includes optimistic updates and proper error handling.

**Implementation:**

```typescript
export function useUpdateConversationState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, state }: { conversationId: string; state: Record<string, unknown> }) => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.patch(`/api/v1/conversations/${conversationId}`, { state });
      return response.data.data;
    },
    // Optimistic update
    onMutate: async ({ conversationId, state }) => {
      await queryClient.cancelQueries({
        queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId),
      });

      const previousConversation = queryClient.getQueryData<ConversationModel>(CONVERSATION_QUERY_KEYS.detail(conversationId));

      // Optimistically update
      if (previousConversation) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.detail(conversationId), {
          ...previousConversation,
          state: {
            ...previousConversation.state,
            ...state,
          },
        });
      }

      return { previousConversation };
    },
    // Rollback on error
    onError: (error, variables, context) => {
      if (context?.previousConversation) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.detail(variables.conversationId), context.previousConversation);
      }
    },
    // Invalidate to refetch from server
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.detail(variables.conversationId),
      });
    },
  });
}
```

**Acceptance Criteria:**

- [ ] Hook created and exported
- [ ] Properly typed
- [ ] Optimistic updates work correctly
- [ ] Rollback on error works
- [ ] Invalidates conversation query on success
- [ ] Handles errors gracefully

---

### Task 4.3: Add Web Browsing Toggle to ConversationMessageInput

**Status:** 🔴 Not Started  
**File:** `packages/client/src/components/conversation/ConversationMessageInput.tsx`  
**Lines:** Add after line ~1520 (near send button area)

**Description:**
Add a compact web browsing toggle to the conversation message input component, visible only when `conversationId` exists.

**UI Requirements:**

- [ ] Compact toggle with globe icon
- [ ] Only visible when `conversationId` is present (not for new conversations)
- [ ] Positioned near input area (not cluttering minimal mode)
- [ ] Shows loading state during update
- [ ] Shows success/error feedback
- [ ] Disabled during streaming/responding

**Implementation Notes:**

- Use `Switch` component (check if imported, add if needed)
- Use `useUpdateConversationState` hook (from Task 4.2)
- Read current state from `useConversationDetail` hook (from Task 4.1)
- Toggle state initialized from conversation state (Task 4.4)
- Optimistic update handled by hook
- Show cost info: "$4 per 1,000 results (max $0.02 per request)"
- Position: Near input area, compact design for minimal mode

**UI Placement Options:**

1. Above input (before context limit indicator) - Recommended
2. Below input (after cost hint) - Alternative
3. Inline with send button - Too cluttered

**Toggle Behavior:**

- ON: Set `state.plugins = [{ id: 'web', max_results: 3 }]`
- OFF: Set `state.plugins = null` (explicit clear, removes from state)

**Acceptance Criteria:**

- [ ] Toggle renders correctly
- [ ] Only visible for existing conversations
- [ ] Updates conversation state correctly
- [ ] Provides visual feedback
- [ ] Handles errors gracefully
- [ ] Doesn't interfere with message sending

---

### Task 4.4: Load Conversation State for Toggle Initialization

**Status:** 🔴 Not Started  
**File:** `packages/client/src/components/conversation/ConversationMessageInput.tsx`

**Description:**
Ensure the component reads conversation state to initialize toggle state correctly.

**Implementation:**

- [ ] Use `useConversationDetail` hook (from Task 4.1) to get conversation with state
- [ ] Check `conversation.state?.plugins` for web plugin
- [ ] Initialize toggle checked state: `Array.isArray(plugins) && plugins.some(p => p.id === 'web')`
- [ ] Handle loading state while fetching conversation
- [ ] Handle case where conversation or state is undefined/null

**Code Pattern:**

```typescript
const { data: conversation, isLoading: isLoadingConversation } = useConversationDetail(conversationId);
const hasWebBrowsing = useMemo(() => {
  if (!conversation?.state?.plugins) return false;
  const plugins = conversation.state.plugins;
  return Array.isArray(plugins) && plugins.some((p: any) => p?.id === 'web');
}, [conversation?.state?.plugins]);
```

**Acceptance Criteria:**

- [ ] Toggle reflects current conversation state
- [ ] Handles loading state
- [ ] Handles missing state gracefully
- [ ] Updates when conversation changes

---

### Task 4.5: Add Visual Feedback and Error Handling

**Status:** 🔴 Not Started  
**File:** `packages/client/src/components/conversation/ConversationMessageInput.tsx`

**Description:**
Add proper loading states, success feedback, and error handling for the toggle.

**Requirements:**

- [ ] Loading spinner/state during update
- [ ] Toast notification on success
- [ ] Toast notification on error
- [ ] Disable toggle during update
- [ ] Revert toggle on error

**Acceptance Criteria:**

- [ ] User sees clear feedback
- [ ] Errors are handled gracefully
- [ ] Toggle state is consistent
- [ ] No UI glitches during updates

---

## Phase 5: Testing & Validation

**Status:** 🔴 Not Started  
**Estimated Time:** 2-3 hours

### Task 5.1: Unit Tests for State Merging

**Status:** 🔴 Not Started  
**File:** `packages/server/src/services/__tests__/ConversationService.test.ts`

**Description:**
Complete unit tests from Phase 1, Task 1.3.

**Acceptance Criteria:**

- [ ] All test cases pass
- [ ] Coverage > 80%

---

### Task 5.2: Integration Tests for API

**Status:** 🔴 Not Started  
**File:** `packages/server/src/routes/__tests__/conversations.test.ts`

**Description:**
Complete integration tests from Phase 2, Task 2.4.

**Acceptance Criteria:**

- [ ] All test cases pass
- [ ] Edge cases covered

---

### Task 5.3: E2E Testing - Toggle Functionality

**Status:** 🔴 Not Started  
**File:** Manual testing / E2E test suite

**Test Scenarios:**

- [ ] Toggle ON → agent gets web browsing in next message
- [ ] Toggle OFF → agent loses web browsing in next message
- [ ] Toggle persists across page refresh
- [ ] Toggle works with different agents in same conversation
- [ ] New conversation → toggle disabled (no conversationId)
- [ ] Agent with plugins → conversation toggle can override
- [ ] Agent without plugins → conversation toggle enables it

**Acceptance Criteria:**

- [ ] All scenarios pass
- [ ] No regressions
- [ ] Performance acceptable

---

### Task 5.4: Edge Case Testing

**Status:** 🔴 Not Started

**Edge Cases:**

- [ ] Conversation state is null/undefined
- [ ] Agent state is null/undefined
- [ ] Both states have plugins (conversation wins)
- [ ] Empty plugins array (explicit disable)
- [ ] Multiple agents in conversation
- [ ] Rapid toggle on/off
- [ ] Toggle during active streaming

**Acceptance Criteria:**

- [ ] All edge cases handled gracefully
- [ ] No crashes or errors
- [ ] State remains consistent

---

## Phase 6: Documentation & Cleanup

**Status:** 🔴 Not Started  
**Estimated Time:** 1 hour

### Task 6.1: Update API Documentation

**Status:** 🔴 Not Started  
**File:** API docs / OpenAPI spec

**Description:**
Document the conversation state update endpoint and plugins structure.

**Content:**

- [ ] Document PATCH /conversations/:id with state parameter
- [ ] Document plugins structure
- [ ] Document precedence rules (conversation > agent)
- [ ] Add examples

**Acceptance Criteria:**

- [ ] Documentation is clear and complete
- [ ] Examples are accurate
- [ ] Precedence rules explained

---

### Task 6.2: Update Component Documentation

**Status:** 🔴 Not Started  
**File:** Component README or JSDoc

**Description:**
Document the conversation-level web browsing feature.

**Content:**

- [ ] Document ConversationMessageInput toggle
- [ ] Explain when toggle is visible
- [ ] Document state update behavior
- [ ] Note removal of agent-level toggle

**Acceptance Criteria:**

- [ ] Documentation is accurate
- [ ] Usage is clear

---

### Task 6.3: Add TypeScript Types for State Structure

**Status:** 🔴 Not Started  
**File:** `packages/protocol/src/domains/conversation.ts` or create new types file

**Description:**
Add TypeScript types/interfaces for conversation state structure, specifically for plugins.

**Types to Add:**

```typescript
export interface ConversationPlugin {
  id: string;
  max_results?: number;
}

export interface ConversationState {
  plugins?: ConversationPlugin[] | null;
  [key: string]: unknown; // Allow other state fields
}
```

**Update:**

- [ ] Add types to protocol package
- [ ] Update ConversationModel to use typed state
- [ ] Update frontend to use types
- [ ] Ensure type safety in merge logic

**Acceptance Criteria:**

- [ ] Types are properly defined
- [ ] Types are exported and used
- [ ] Type safety is maintained
- [ ] No `any` types for state.plugins

---

### Task 6.4: Code Cleanup

**Status:** 🔴 Not Started

**Actions:**

- [ ] Remove unused imports
- [ ] Remove console.log statements (keep error logs)
- [ ] Add JSDoc comments where needed
- [ ] Ensure consistent code style
- [ ] Run linter and fix issues
- [ ] Remove any temporary debug code

**Acceptance Criteria:**

- [ ] No linting errors
- [ ] Code is clean and maintainable
- [ ] No debug code left behind
- [ ] JSDoc comments added for public APIs

---

## Progress Summary

### Overall Progress: 0% (0/33 tasks completed)

**By Phase:**

- Phase 1 (Backend - State Merging): 0/5 tasks (0%)
- Phase 2 (Backend - API Layer): 0/5 tasks (0%)
- Phase 3 (Frontend - Remove Agent Toggles): 0/3 tasks (0%)
- Phase 4 (Frontend - Add Conversation Toggle): 0/5 tasks (0%)
- Phase 5 (Testing & Validation): 0/4 tasks (0%)
- Phase 6 (Documentation & Cleanup): 0/4 tasks (0%)

---

## Status Legend

- 🔴 **Not Started** - Task not yet begun
- 🟡 **In Progress** - Task actively being worked on
- 🟢 **Completed** - Task finished and verified
- ⚠️ **Blocked** - Task blocked by dependency or issue
- 🔄 **Review** - Task completed, awaiting review

---

## Notes

- Agent-level plugins remain functional via API but are no longer exposed in UI
- Conversation-level plugins take precedence over agent-level plugins
- This change is backward compatible (existing agent plugins still work as fallback)
- No database migration needed (uses existing JSONB state field)
- Empty array `[]` means "explicitly no plugins" (conversation-level disable)
- `null` means "remove plugins" (explicit clear)
- `undefined` means "not set" (fall back to agent-level)
- State updates use shallow merge to preserve other conversation state fields (appropriate since state is flat)

---

## Dependencies

- Phase 1 must complete before Phase 2
- Phase 2 must complete before Phase 4
- Phase 3 can run in parallel with Phase 1-2
- Phase 4 depends on Phase 2 completion
- Phase 5 depends on all previous phases
- Phase 6 depends on Phase 5 completion

---

## Risk Assessment

**Low Risk:**

- State merging logic changes (well-isolated)
- UI toggle removal (straightforward)

**Medium Risk:**

- API schema changes (need backward compatibility)
- State merge edge cases

**Mitigation:**

- Comprehensive testing in Phase 5
- Backward compatible API design
- Gradual rollout with feature flag (if needed)
