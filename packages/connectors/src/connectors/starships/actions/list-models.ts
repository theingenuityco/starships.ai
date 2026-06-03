import type { CodeAction } from '../../../framework';

export const listModels: CodeAction = {
  name: "list-models",
  description: "List OpenRouter models via Starships proxy",
  method: "GET",
  path: "/llm/models",
  parameters: {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/llm/models`, {
  timeoutMs: 10000,
}),
};
