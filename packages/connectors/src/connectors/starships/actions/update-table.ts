import type { CodeAction } from '../../../framework';

export const updateTable: CodeAction = {
  name: "update-table",
  description: "Update a table (including columns/primaryKey/archived) by id or slug",
  method: "PATCH",
  path: "/starships/{starshipId}/tables/{tableIdOrSlug}",
  parameters: {
    "type": "object",
    "required": [
      "starshipId"
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
      "archived": {
        "type": "boolean"
      },
      "tableId": {
        "type": "string"
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
      "tableSlug": {
        "type": "string"
      },
      "description": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.patch(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/tables/${encodeURIComponent(String(args.tableSlug ?? args.tableId ?? ""))}`, {
  body: {
    "name": args.name === undefined ? undefined : args.name,
    "columns": args.columns === undefined ? undefined : (args.columns ?? []),
    "archived": args.archived === undefined ? undefined : args.archived,
    "primaryKey": args.primaryKey === undefined ? undefined : args.primaryKey,
    "description": args.description === undefined ? undefined : args.description,
  },
  timeoutMs: 15000,
}),
};
