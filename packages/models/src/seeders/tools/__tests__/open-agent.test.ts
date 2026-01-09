/**
 * Open Agent Tool Tests
 * Validates schema, runtime behavior, and template parity for the agent creation tool.
 */

import { agentOpenTool, agentOpenToolTemplate } from '../open-agent';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, NodeHandlerOptions, HostRuntime } from '@starships/autopilot';

function okResponse(body: unknown) {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    body,
    url: 'connector://starships/open-agent-test',
  };
}

function createHostRuntime(overrides: Partial<HostRuntime> = {}): HostRuntime {
  return {
    http: jest.fn(async () => okResponse({ ok: true })),
    connectorAction: jest.fn(async () => okResponse({ ok: true })),
    ...overrides,
  };
}

function createTool(hostRuntime?: HostRuntime) {
  const options: NodeHandlerOptions = {
    eventCallback: jest.fn(),
    runtimeEnv: {
      STARSHIP_ID: 'starship-test-123',
    },
    hostRuntime: hostRuntime ?? createHostRuntime(),
  };

  const toolNode = new Tool(agentOpenTool, options);
  const validation = toolNode.validate();
  expect(validation.valid).toBe(true);
  return toolNode;
}

describe('Open Agent tool definition', () => {
  it('exposes a typed role parameter that mirrors API constraints', () => {
    const roleParam = agentOpenTool.parameters.properties.role;
    expect(roleParam).toBeDefined();
    expect(roleParam?.type).toBe('string');
    expect(roleParam?.minLength).toBe(1);
    expect(roleParam?.maxLength).toBe(255);
    expect(Array.isArray(roleParam?.examples)).toBe(true);
  });

  it('keeps template metadata in sync with the live tool definition', () => {
    expect(agentOpenToolTemplate.parameters).toEqual(agentOpenTool.parameters);
    expect(agentOpenToolTemplate.blueprint).toEqual(agentOpenTool.blueprint);
    expect(agentOpenToolTemplate.slug).toBe('open-agent');
  });
});

describe('Open Agent tool runtime behavior', () => {
  it('passes the role field through to the create-agent connector action', async () => {
    const connectorAction = jest.fn(async (request: Parameters<HostRuntime['connectorAction']>[0]) =>
      okResponse({
        mode: request.action,
        payload: request.args,
      })
    );
    const hostRuntime = createHostRuntime({ connectorAction });
    const toolNode = createTool(hostRuntime);

    const result = await toolNode.execute([
      {
        json: {
          name: 'Customer Inbox',
          role: 'Customer Support Specialist',
          description: 'Helps triage emails',
        },
        pairedItem: { item: 0 },
      } as ExecutionItem,
    ]);

    const unwrapped = ExecutionItemUtils.unwrapSingle(result);
    expect(unwrapped.body).toMatchObject({
      mode: 'create-agent',
      payload: expect.objectContaining({
        role: 'Customer Support Specialist',
        name: 'Customer Inbox',
      }),
    });

    expect(connectorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: 'starships',
        action: 'create-agent',
        args: expect.objectContaining({
          role: 'Customer Support Specialist',
        }),
      })
    );
  });

  it('does not require role when opening an existing agent by slug', async () => {
    const connectorAction = jest.fn(async (request: Parameters<HostRuntime['connectorAction']>[0]) =>
      okResponse({
        mode: request.action,
        args: request.args,
      })
    );
    const hostRuntime = createHostRuntime({ connectorAction });
    const toolNode = createTool(hostRuntime);

    const result = await toolNode.execute([
      {
        json: {
          slug: 'support-agent',
        },
        pairedItem: { item: 0 },
      } as ExecutionItem,
    ]);

    const unwrapped = ExecutionItemUtils.unwrapSingle(result);
    expect(unwrapped.body).toMatchObject({
      mode: 'get-agent',
      args: expect.objectContaining({
        slug: 'support-agent',
      }),
    });

    expect(connectorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'get-agent',
      })
    );
  });

  it('returns a structured error payload when name is provided without role', async () => {
    const toolNode = createTool();

    const execution = await toolNode.execute([
      {
        json: {
          name: 'Missing Role Agent',
        },
        pairedItem: { item: 0 },
      } as ExecutionItem,
    ]);

    expect(Array.isArray(execution)).toBe(true);
    const first = execution[0];
    expect(first?.error).toContain('role is required when creating an agent');
  });
});
