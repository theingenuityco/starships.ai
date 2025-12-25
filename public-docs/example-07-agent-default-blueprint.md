## Example 07 — Agent with default tool-enabled blueprint

Goal: Use `Agent` to auto-generate a full tool-enabled loop when no blueprint is provided.

Important: The current default Agent blueprint delegates tool execution to the **Starships server** via a `connector_action` call (`connector: "starships"`, `action: "authorize-and-maybe-execute-tool"`). This example is intended for the hosted Starships environment (or an embedding host that provides an equivalent Starships connector template + sessions).

Code

```ts
import { Agent, type HostRuntime } from '@starships/autopilot';

// Provided by the embedding host/server (not by the blueprint).
const hostRuntime = {} as HostRuntime;

const agent = new Agent(
  {
    name: 'Assistant',
    model: 'anthropic/claude-3.5-sonnet',
    systemPrompt: 'Be helpful and concise.',
    state: {
      messages: [{ role: 'user', content: 'What time is it in Tokyo?' }],
      // Note: tool.blueprint is not executed locally by the default Agent blueprint; the server owns tool execution.
      tools: [
        {
          name: 'Time',
          slug: 'time_now',
          description: 'Return current time in a given timezone',
          parameters: {
            type: 'object',
            properties: { tz: { type: 'string' } },
            required: ['tz'],
          },
        },
      ],
    },
  },
  {
    hostRuntime,
    runtimeEnv: {
      AGENT_ID: '<agent-id>',
      CONVERSATION_ID: '<conversation-id>',
      // SERVER_URL: 'https://<your-starships-host>' (if your starships connector template uses it)
    },
  }
);

const out = await agent.execute();
```

