/**
 * Code-action framework — authoring helpers.
 *
 * `defineAction` is the ergonomic entrypoint: author `params` once as a Zod schema and
 * get (a) the JSON Schema for LLM tool exposure via `z.toJSONSchema`, (b) runtime
 * validation, and (c) a typed `run(args, ctx)` where `args` is `z.infer` of the schema.
 *
 * `codeActionToEndpoint` projects a CodeAction into the `ConnectorEndpointV2` shape the
 * catalog + DB tool seeding already consume (name/description/method/path/parameters,
 * never a `mapping`).
 */

import { z } from 'zod';
import type { ConnectorEndpointV2, HttpMethod } from '@starships/protocol';
import type { ActionContext, CodeAction, HttpEnvelope } from './types';

export interface ZodActionSpec<P extends z.ZodTypeAny> {
  name: string;
  description: string;
  method?: HttpMethod;
  path?: string;
  params: P;
  run: (args: z.infer<P>, ctx: ActionContext) => Promise<HttpEnvelope | unknown>;
}

/** JSON Schema for the LLM tool layer, stripped of the `$schema` preamble. */
export function toToolJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const full = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _drop, ...rest } = full;
  return rest;
}

export function defineAction<P extends z.ZodTypeAny>(spec: ZodActionSpec<P>): CodeAction {
  const parameters = toToolJsonSchema(spec.params);
  return {
    name: spec.name,
    description: spec.description,
    method: spec.method,
    path: spec.path,
    parameters,
    parse: (args: unknown) => spec.params.parse(args) as Record<string, unknown>,
    run: (args: Record<string, unknown>, ctx: ActionContext) => spec.run(args as z.infer<P>, ctx),
  };
}

/** Project a CodeAction into the endpoint shape consumed by the catalog + tool seeding. */
export function codeActionToEndpoint(a: CodeAction): ConnectorEndpointV2 {
  return {
    kind: 'http',
    name: a.name,
    description: a.description,
    method: (a.method ?? 'POST') as HttpMethod,
    path: a.path ?? '',
    parameters: a.parameters,
  } as ConnectorEndpointV2;
}
