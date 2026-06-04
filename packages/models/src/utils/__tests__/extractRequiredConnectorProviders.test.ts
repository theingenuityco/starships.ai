import { extractRequiredConnectorProviders } from '../extractRequiredConnectorProviders';
import type { Blueprint } from '@starships/protocol';

describe('extractRequiredConnectorProviders', () => {
  it('returns empty array for null blueprint', () => {
    expect(extractRequiredConnectorProviders(null)).toEqual([]);
  });

  it('returns empty array for undefined blueprint', () => {
    expect(extractRequiredConnectorProviders(undefined)).toEqual([]);
  });

  it('returns empty array for blueprint with no nodes', () => {
    expect(extractRequiredConnectorProviders({ nodes: [], edges: [] })).toEqual([]);
  });

  it('returns empty array for blueprint with empty nodes', () => {
    expect(
      extractRequiredConnectorProviders({
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} },
        ],
        edges: [],
      } as Blueprint)
    ).toEqual([]);
  });

  it('extracts connector from connector_action node with static string', () => {
    const blueprint: Blueprint = {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
        {
          ref: 'ca1',
          type: 'connector_action',
          name: 'Call Starships',
          description: '',
          parameters: { connector: 'starships', action: 'list-agents' },
        },
        { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} },
      ],
      edges: [],
    };
    expect(extractRequiredConnectorProviders(blueprint)).toEqual(['starships']);
  });

  it('extracts and dedupes multiple connectors', () => {
    const blueprint: Blueprint = {
      nodes: [
        {
          ref: 'ca1',
          type: 'connector_action',
          name: 'LinkedIn',
          description: '',
          parameters: { connector: 'linkedin', action: 'post' },
        },
        {
          ref: 'ca2',
          type: 'connector_action',
          name: 'Discord',
          description: '',
          parameters: { connector: 'discord', action: 'send' },
        },
        {
          ref: 'ca3',
          type: 'connector_action',
          name: 'LinkedIn again',
          description: '',
          parameters: { connector: 'linkedin', action: 'get' },
        },
      ],
      edges: [],
    };
    const result = extractRequiredConnectorProviders(blueprint);
    expect(result).toContain('linkedin');
    expect(result).toContain('discord');
    expect(result).toHaveLength(2);
  });

  it('skips expression-like connector values', () => {
    const blueprint: Blueprint = {
      nodes: [
        {
          ref: 'ca1',
          type: 'connector_action',
          name: 'Dynamic',
          description: '',
          parameters: { connector: '{{ env("CONNECTOR") }}', action: 'get' },
        },
      ],
      edges: [],
    };
    expect(extractRequiredConnectorProviders(blueprint)).toEqual([]);
  });

  it('lowercases connector values', () => {
    const blueprint: Blueprint = {
      nodes: [
        {
          ref: 'ca1',
          type: 'connector_action',
          name: 'LinkedIn',
          description: '',
          parameters: { connector: 'LinkedIn', action: 'post' },
        },
      ],
      edges: [],
    };
    expect(extractRequiredConnectorProviders(blueprint)).toEqual(['linkedin']);
  });

  it('ignores non-connector_action nodes', () => {
    const blueprint: Blueprint = {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
        {
          ref: 'code1',
          type: 'code',
          name: 'Code',
          description: '',
          parameters: { code: 'return 1' },
        },
        {
          ref: 'llm1',
          type: 'llm',
          name: 'LLM',
          description: '',
          parameters: { model: 'gpt-4' },
        },
        { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} },
      ],
      edges: [],
    };
    expect(extractRequiredConnectorProviders(blueprint)).toEqual([]);
  });

  it('skips connector_action when connector is not a string', () => {
    const blueprint = {
      nodes: [
        {
          ref: 'ca1',
          type: 'connector_action',
          name: 'Bad',
          description: '',
          parameters: { connector: 123, action: 'get' },
        },
      ],
      edges: [],
    } as unknown as Blueprint;
    expect(extractRequiredConnectorProviders(blueprint)).toEqual([]);
  });

  it('handles mixed nodes: connector_action and others', () => {
    const blueprint: Blueprint = {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
        {
          ref: 'ca1',
          type: 'connector_action',
          name: 'Starships',
          description: '',
          parameters: { connector: 'starships', action: 'list' },
        },
        {
          ref: 'code1',
          type: 'code',
          name: 'Process',
          description: '',
          parameters: { code: 'return {}' },
        },
        { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} },
      ],
      edges: [],
    };
    expect(extractRequiredConnectorProviders(blueprint)).toEqual(['starships']);
  });
});
