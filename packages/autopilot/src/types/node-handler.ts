/**
 * Node NodeHandler Interface and Base Class
 *
 * Base interface and abstract class for workflow node handlers with lazy loading support
 */

import { Execution, NodeParameters, ValidationResult, ExecutionItem } from '@/types';
import type { ToolParams } from './node-parameters';
import { EventCallback } from '@/types/events';

/**
 * Base interface for workflow node handlers
 * Handlers are now instantiated with parameters via constructor
 */

export interface NodeHandler {
  /** Execute with parameters already injected via constructor and optional input items */
  execute(input?: ExecutionItem[]): Promise<ExecutionItem[]>;

  /** Validate the handler's configuration */
  validate(): ValidationResult;
}

/**
 * Host-level LLM request description.
 *
 * The LLM node passes a provider-agnostic request object to the host, which is
 * responsible for talking to the actual LLM provider (OpenRouter, OpenAI, etc.)
 * and returning a streaming response. The streaming chunks are then normalized
 * and converted into an LLMResponse by the LLM node.
 */
export interface LlmHostRequest {
  model: string;
  messages: unknown[];
  tools?: ToolParams[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  reasoning?: unknown;
  /**
   * Optional streaming control.
   *
   * - When true/omitted: host may stream tokens/chunks.
   * - When false: host should perform a non-stream completion and return a single "chunk-like"
   *   item wrapped as an AsyncIterable for compatibility with the LLM node's accumulator.
   */
  stream?: boolean;
  /**
   * OpenRouter multimodal output configuration.
   * For image generation, include: ['image', 'text']
   */
  modalities?: Array<'text' | 'image'>;
  /**
   * Provider-specific image configuration.
   * OpenRouter uses snake_case `image_config` in the HTTP payload; we keep camelCase here
   * and the host runtime will map it.
   */
  imageConfig?: Record<string, unknown>;
}

/**
 * HostRuntime
 *
 * Typed surface provided by the embedding host/server to perform side-effecting
 * operations (HTTP, LLM calls, etc.). Workflows never talk to the network
 * directly; they delegate via this interface so the host can own secrets,
 * provider configuration, policies, and observability.
 */
export interface HostRuntime {
  /**
   * HTTP execution entrypoint.
   *
   * All HTTP performed by Autopilot nodes should flow through this method.
   * When connector is provided, the host may resolve connector records,
   * inject secrets, and apply connector-specific policies before performing
   * the actual request.
   */
  http(request: {
    method: string;
    url: string;
    headers?: Record<string, unknown>;
    body?: unknown;
    timeoutMs?: number;
    connector?: string;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
    body: unknown;
    url: string;
  }>;

  /**
   * LLM execution entrypoint.
   *
   * The host is responsible for:
   * - Selecting the concrete provider (OpenRouter, OpenAI, Anthropic, etc.)
   * - Reading any required credentials (API keys) from its own environment
   * - Performing the actual network calls
   *
   * It must return an AsyncIterable of provider-native streaming chunks; the
   * LLM node will normalize these chunks and emit Autopilot streaming events,
   * then accumulate a final LLMResponse.
   */
  llm?(request: LlmHostRequest): Promise<AsyncIterable<unknown>>;
}

export interface NodeHandlerOptions {
  eventCallback?: EventCallback;
  execution?: Execution;
  /**
   * Non-secret runtime environment values that may be safely exposed to
   * templates and user-authored code (Code/Mutate). Secrets MUST NOT be
   * placed here; they should only ever flow through server-side connector
   * execution.
   */
  runtimeEnv?: Record<string, unknown>;
  /**
   * Host-provided runtime surface for side-effecting operations (HTTP, etc.).
   * This replaces the legacy callConnector hook with a typed interface.
   */
  hostRuntime?: HostRuntime;
}
/**
 * Constructor type for handlers that accept the full node object
 */
export type NodeHandlerConstructor = new (params: NodeParameters, options?: NodeHandlerOptions) => NodeHandler;
