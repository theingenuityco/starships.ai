## Node: UserPrompt

What it is: UX integration point for human-in-the-loop selection/input. Current implementation is a placeholder that returns a synthesized user message from the first choice.

Specification (authoritative)
- Handler: `packages/autopilot/src/nodes/UserPrompt.ts`
- Parameters (resolved by Engine before execution; stringEvaluationMode: full-only):
  - promptText: string (required)
  - choices: { id: string; text: string; value: unknown; description?: string }[] (required, non-empty)
  - sourceNodeId?: string
  - timeout?: number
  - required?: boolean

Execution behavior (current)
- No UI blocking/wait; returns:
  - `{ message: { role: 'user', content: choices[0].text } }`
- Intended to be replaced by UI-driven pause/resume flow in future.

Validation rules
- promptText required (non-empty).
- choices required (length > 0).

Use cases
- Intermediate placeholder until UI-backed prompting is implemented.
- Deterministic branch selection when a UX step is expected later.

Example

```ts
{
  ref: "ask-user",
  type: "user_prompt",
  name: "Choose action",
  parameters: {
    promptText: "Proceed with deployment?",
    choices: [
      { id: "yes", text: "Yes", value: true },
      { id: "no", text: "No", value: false }
    ],
    required: true
  }
}
```


