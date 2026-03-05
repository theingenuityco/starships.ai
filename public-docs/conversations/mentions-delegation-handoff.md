---
title: Mentions, Delegation, and Handoff
slug: conversations/mentions-delegation-handoff
category: conversations
---

## Overview

Starships uses three related concepts for multi-agent workflows:

- **Mentions**: structured tokens embedded in message `content`
- **Handoff**: selecting which agent responds next **in the same conversation**
- **Delegation**: moving work into a **child conversation** (thread)

This page defines each concept and provides concrete usage recipes.

## Mentions (structured tokens)

Mentions are stored as **structured tokens** in message `content`:

- **Agent mention**: `<@a:AGENT_ID>`
- **User mention**: `<@u:USER_ID>`

The Starships composer produces these tokens when you pick a mention from the `@` suggestion UI. Transcripts typically render these tokens as `@Name`, while preserving the stored token form for routing/indexing.

## Handoff (same conversation)

Handoff means: the next message in a conversation is routed to a different agent.

### Recipe: hand off to a specific agent

Send a message that includes an agent mention token:

```json
{
  "content": "<@a:AGENT_ID> Please take over and handle this."
}
```

### Recipe: hand off to multiple agents

Include multiple agent mentions in the same message:

```json
{
  "content": "<@a:AGENT_ID_A> Summarize the situation.\n<@a:AGENT_ID_B> Propose next steps."
}
```

## Delegation (child conversation)

Delegation means: a task runs inside a **child conversation** (thread) under a parent conversation.

### Delegation tool: `call-agent` (tool instance)

Starships supports delegation via a tool instance commonly assigned slug `call-agent`.

#### Input contract (deployed instance)

```json
{
  "content": "<@a:AGENT_ID> Message to send in the delegated thread",
  "childConversationId": "optional existing child conversation id",
  "parentConversationId": "optional parent conversation id"
}
```

#### Behavior

- If `childConversationId` is omitted, the tool creates a new child conversation (thread).
- The tool sends `content` into the child conversation with `sync: true`.
- Agent selection inside the child conversation is driven by the **agent mention token(s)** inside `content`.

#### Output shape (typical)

The tool returns a small payload including:

- `childConversationId`
- `lastMessage` (the most recent message in the child conversation)
- `status` (human-readable completion status)

