## Example 07 — Agent with default tool-enabled blueprint

Goal: Use `Agent` to auto-generate a full tool-enabled loop when no blueprint is provided.

Code

```ts
import { Agent } from '@starships/autopilot';

const agent = new Agent({
  name: 'Assistant',
  model: 'anthropic/claude-3.5-sonnet',
  systemPrompt: 'Be helpful and concise.',
  state: {
    messages: [{ role: 'user', content: 'What time is it in Tokyo?' }],
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
        blueprint: {
          nodes: [
            { ref: 's', type: 'start', name: 'Start', parameters: {} },
            {
              ref: 'code',
              type: 'code',
              name: 'Get Time',
              parameters: {
                code: `
                  async function main(ctx) {
                    const { tz } = ctx.input || {};
                    return { now: new Date().toLocaleString('en-US', { timeZone: String(tz) }) };
                  }
                `,
              },
            },
            { ref: 'e', type: 'end', name: 'End', parameters: { output: '{{ lastOutputOf("code") }}' } },
          ],
          edges: [
            { ref: 'e1', from: 's', to: 'code' },
            { ref: 'e2', from: 'code', to: 'e' },
          ],
        },
      },
    ],
  },
});

const out = await agent.execute();
```

