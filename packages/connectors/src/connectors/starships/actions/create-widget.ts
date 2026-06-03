import type { CodeAction } from '../../../framework';

export const createWidget: CodeAction = {
  name: "create-widget",
  description: "Create a widget",
  method: "POST",
  path: "/widgets",
  parameters: {
    "type": "object",
    "required": [
      "name",
      "description",
      "widgetType",
      "props",
      "starshipId"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "props": {
        "type": "object"
      },
      "starshipId": {
        "type": "string"
      },
      "widgetType": {
        "type": "string"
      },
      "description": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/widgets`, {
  body: {
    "name": args.name,
    "props": args.props,
    "starshipId": String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""),
    "widgetType": args.widgetType,
    "description": args.description,
  },
  timeoutMs: 5000,
}),
};
