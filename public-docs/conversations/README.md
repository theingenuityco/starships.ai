---
title: Conversations (Overview)
slug: conversations
category: conversations
---

## What is a “conversation” in Starships?

In Starships, a **conversation** is the underlying container for message history and agent turns.
Several higher-level product concepts are **conversation-backed**:

- **Channels**: chat timelines (Slack/Discord-like) within a starship
- **Rooms**: forum-style containers that hold **threads** plus pinned resources
- **Direct messages (DMs)**: user↔agent conversation-backed DMs
- **Threads**: child conversations nested under a parent conversation

At the API level, these all share a common identifier shape: a **conversation id**.

## Documentation map (recommended reading order)

- **1) Conversations API + connector actions**: [Conversations](./conversations.md)
- **2) Channels (conversation-backed)**: [Channels](./channels.md)
- **3) Rooms (forum + pins)**: [Rooms](./rooms.md)
- **4) Threads (child conversations)**: [Threads](./threads.md)

## Two ways to interact with conversations

You can interact with conversation-backed concepts via:

- **HTTP API** (server endpoints under `/api/v1`)
- **Starships connector actions** via `connector_action` nodes (recommended for agents when available)

Note: connector actions exist for **some** conversation-related operations (e.g. sending a message, creating a conversation, channel CRUD), but not all (e.g. rooms CRUD and room pins are HTTP-only today).

