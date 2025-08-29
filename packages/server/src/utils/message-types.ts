/**
 * Simple message types to replace LangChain message classes
 * Used for mission orchestration and other advanced features
 */

export interface BaseMessage {
  content: string;
  additional_kwargs?: Record<string, unknown>;
  // LangChain compatibility fields (dummy values)
  lc_namespace?: string[];
  lc_serializable?: boolean;
  lc_aliases?: Record<string, string>;
  text?: string;
  name?: string;
  response_metadata?: Record<string, unknown>;
  _getType?(): string;
  getType?(): string;
  toDict?(): Record<string, unknown>;
  toJSON?(): Record<string, unknown>;
  toString?(): string;
}

export class HumanMessage implements BaseMessage {
  content: string;
  additional_kwargs?: Record<string, unknown>;
  lc_namespace = ['langchain', 'schema', 'messages'];
  lc_serializable = true;
  lc_aliases = {};
  text: string;
  response_metadata = {};

  constructor(fields: { content: string; additional_kwargs?: Record<string, unknown> }) {
    this.content = fields.content;
    this.text = fields.content;
    this.additional_kwargs = fields.additional_kwargs;
  }

  _getType(): string { return 'human'; }
  getType(): string { return 'human'; }
  toDict(): Record<string, unknown> { return { content: this.content, type: 'human' }; }
  toJSON(): Record<string, unknown> { return this.toDict(); }
  toString(): string { return this.content; }
}

export class AIMessage implements BaseMessage {
  content: string;
  additional_kwargs?: Record<string, unknown>;
  lc_namespace = ['langchain', 'schema', 'messages'];
  lc_serializable = true;
  lc_aliases = {};
  text: string;
  name?: string;
  response_metadata = {};

  constructor(fields: { content: string; additional_kwargs?: Record<string, unknown>; name?: string }) {
    this.content = fields.content;
    this.text = fields.content;
    this.additional_kwargs = fields.additional_kwargs;
    this.name = fields.name;
  }

  _getType(): string { return 'ai'; }
  getType(): string { return 'ai'; }
  toDict(): Record<string, unknown> { return { content: this.content, type: 'ai', name: this.name }; }
  toJSON(): Record<string, unknown> { return this.toDict(); }
  toString(): string { return this.content; }
}

export class SystemMessage implements BaseMessage {
  content: string;
  additional_kwargs?: Record<string, unknown>;
  lc_namespace = ['langchain', 'schema', 'messages'];
  lc_serializable = true;
  lc_aliases = {};
  text: string;
  response_metadata = {};

  constructor(fields: { content: string; additional_kwargs?: Record<string, unknown> }) {
    this.content = fields.content;
    this.text = fields.content;
    this.additional_kwargs = fields.additional_kwargs;
  }

  _getType(): string { return 'system'; }
  getType(): string { return 'system'; }
  toDict(): Record<string, unknown> { return { content: this.content, type: 'system' }; }
  toJSON(): Record<string, unknown> { return this.toDict(); }
  toString(): string { return this.content; }
}