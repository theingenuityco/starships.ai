// Internal shape of a built-in (system.*) tool. Authored with a Zod schema (used both to
// describe the tool to the model and to validate input before run()). The SystemProvider
// maps these onto the generic ToolDescriptor / ToolsetProvider seam.
import type { ZodTypeAny } from 'zod';
import type { Capability, ToolContext } from '../types';

export interface SystemTool {
  name: string;
  description: string;
  schema: ZodTypeAny;
  sensitive: boolean;
  capabilities: Capability[];
  /** Defaults to 'resident' (system tools are cheap and always in context). */
  residency?: 'resident' | 'deferred';
  /** Run the tool; the returned string is the tool_result. Throw to signal an error. */
  run: (input: unknown, ctx: ToolContext) => Promise<string>;
}
