import type { CodeAction } from '../../../framework';

export const createTable: CodeAction = {
  name: "create-table",
  description: "Create a table for a starship",
  method: "POST",
  path: "/starships/{starshipId}/tables",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "name",
      "columns"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "columns": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "name"
          ],
          "properties": {
            "enum": {
              "type": "object",
              "required": [
                "options"
              ],
              "properties": {
                "options": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              },
              "additionalProperties": false
            },
            "name": {
              "type": "string",
              "description": "Stable key used in row objects"
            },
            "type": {
              "enum": [
                "string",
                "number",
                "boolean",
                "date",
                "datetime",
                "json",
                "enum",
                "reference",
                "formula"
              ],
              "type": "string"
            },
            "format": {
              "enum": [
                "text",
                "number",
                "currency",
                "date",
                "datetime",
                "percentage"
              ],
              "type": "string"
            },
            "formula": {
              "type": "object",
              "required": [
                "expr"
              ],
              "properties": {
                "expr": {
                  "type": "string"
                },
                "resultType": {
                  "enum": [
                    "string",
                    "number",
                    "boolean",
                    "date",
                    "datetime",
                    "json",
                    "enum"
                  ],
                  "type": "string"
                }
              },
              "additionalProperties": false
            },
            "reference": {
              "type": "object",
              "required": [
                "target"
              ],
              "properties": {
                "target": {
                  "oneOf": [
                    {
                      "type": "object",
                      "required": [
                        "kind",
                        "tableIdOrSlug"
                      ],
                      "properties": {
                        "kind": {
                          "enum": [
                            "table_row"
                          ],
                          "type": "string"
                        },
                        "tableIdOrSlug": {
                          "type": "string"
                        }
                      },
                      "additionalProperties": false
                    },
                    {
                      "type": "object",
                      "required": [
                        "kind"
                      ],
                      "properties": {
                        "kind": {
                          "enum": [
                            "task_card"
                          ],
                          "type": "string"
                        }
                      },
                      "additionalProperties": false
                    }
                  ]
                },
                "labelColumn": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            },
            "constraints": {
              "type": "object",
              "properties": {
                "max": {
                  "type": "number"
                },
                "min": {
                  "type": "number"
                },
                "unique": {
                  "type": "boolean"
                },
                "default": {},
                "pattern": {
                  "type": "string"
                },
                "nullable": {
                  "type": "boolean"
                },
                "required": {
                  "type": "boolean"
                },
                "maxLength": {
                  "type": "number"
                },
                "minLength": {
                  "type": "number"
                },
                "autoincrement": {
                  "type": "boolean"
                }
              },
              "additionalProperties": false
            },
            "description": {
              "type": "string"
            }
          },
          "additionalProperties": false
        }
      },
      "primaryKey": {
        "type": [
          "string",
          "null"
        ]
      },
      "starshipId": {
        "type": "string"
      },
      "description": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/tables`, {
  body: {
    "name": args.name,
    "columns": args.columns ?? [],
    "primaryKey": args.primaryKey,
    "description": args.description,
  },
  timeoutMs: 10000,
}),
};
