---
title: Mentions, Delegation, and Handoff
slug: conversations/mentions-delegation-handoff
category: conversations
---

## Why this page exists

Starships supports multiple ways to route work between agents:

- **Mentions**: address agent(s) by mentioning them in the message content.
- **Delegation**: create or continue a *child conversation* (thread) for delegated work.
- **Handoff**: switch who should respond next (often expressed via mentions).

This page documents the concrete mechanics and the recommended patterns.

## Mentions (structured tokens)

### Token formats

The Starships composer emits **structured mention tokens** inside message `content`:

- **Agent mention**: `<@a:AGENT_ID>`
- **User mention**: `<@u:USER_ID>`

Notes:

- These tokens are the **source of truth** used by the server (routing, allowlists, indexing).
- UIs typically render them as `@AgentName` / `@UserName`, but the stored content includes the tokens.

### What mentions do

- **Agent mentions**: determine which agent(s) should execute for a given message (when applicable).
- **User mentions**: are used for mention indexing and notifications; they must not trigger agent execution.

### Mentions in constrained contexts (channels / rooms)

Some contexts are **mention-only**, meaning the server will not “fall back” to a default agent:

- **Channels** (and their threads)
- **Threads with multiple linked agents**
- **Rooms** may additionally enforce **allowlists** for which agents/users may be mentioned

In these contexts, *only explicit agent mention tokens* trigger agent execution.

## Delegation: two primitives

Delegation in Starships is modeled as **child-conversation delegation**:

- A delegated task runs inside a **child conversation** (a thread).
- This is typically initiated by the `call-agent` tool template (see below).

## Delegation tool: `call-agent` (tool template)

Starships commonly implements “delegate to another agent” via a tool template named `Call Agent` (assigned slug `call-agent`).

### Current behavior (DB tool template)

The current deployed tool template delegates by **agent mention tokens inside `content`** and does **not** accept an agent slug parameter.

```json
{
  "content": "<@a:AGENT_ID> Message to send to delegated agent",
  "childConversationId": "optional existing child conversation id",
  "parentConversationId": "optional parent conversation id"
}
```

Runtime behavior:

- If `childConversationId` is missing: create a new child conversation under the current conversation (when available).
- Send `content` into the child conversation with `sync: true`.
- The mentioned agent(s) in `content` are responsible for routing inside the child conversation.
- Return the child conversation id and the latest message result.

Notes:

- `content` must include at least one `<@a:...>` token.

## Handoff patterns

### Same conversation handoff

To hand off within the same conversation:

- Start the message with (or include) an agent mention token: `<@a:AGENT_ID> ...`
- Optionally include multiple agent mention tokens when you want multiple agents to respond.

### Child conversation handoff

To hand off into a dedicated thread:

- Use a delegation tool (such as `call-agent`) to create/continue a child conversation
- Send a message that targets the desired agent(s) (either by slug in the current template, or by mention tokens in a token-first template)

### Important limitation (agent-to-agent “automatic handoff”)

By default, Starships routes based on **the user’s message content**. An agent mentioning another agent inside its *assistant output* does not automatically trigger a follow-on agent execution unless you explicitly implement that orchestration or use a delegation tool.

