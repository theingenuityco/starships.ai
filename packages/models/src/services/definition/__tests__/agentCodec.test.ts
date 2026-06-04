import {
  serializeAgent,
  serializeAgentDefinition,
  agentModelToDefinition,
  parseAgent,
  agentFilename,
  agentSlugFromFilename,
} from '@/services/definition/agentCodec';
import type { AgentModel } from '@starships/protocol';

function makeAgent(overrides: Partial<AgentModel> = {}): AgentModel {
  return {
    id: 'agt_abc123',
    slug: 'researcher',
    name: 'Researcher',
    role: 'Research Assistant',
    description: 'Finds and summarizes sources',
    model: 'anthropic/claude-opus-4',
    category: 'general',
    temperature: 0.7,
    maxTokens: 4000,
    timeout: 30000,
    reasoning: { effort: 'medium', enabled: true },
    previewPrompts: ['Summarize this paper', 'Find related work'],
    version: '1.2.0',
    systemPrompt: 'You are a careful researcher.\n\nAlways cite sources.',
    state: { messages: [], tools: [] },
    starshipId: 'shp_xyz',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  } as AgentModel;
}

describe('agentCodec', () => {
  it('agentFilename and agentSlugFromFilename are inverses', () => {
    expect(agentFilename('researcher')).toBe('researcher.md');
    expect(agentSlugFromFilename('researcher.md')).toBe('researcher');
  });

  it('round-trips authored fields losslessly', () => {
    const agent = makeAgent();
    const file = serializeAgent(agent, { connectors: ['github-main'] });
    const parsed = parseAgent(file);

    expect(parsed.id).toBe(agent.id);
    expect(parsed.slug).toBe(agent.slug);
    expect(parsed.name).toBe(agent.name);
    expect(parsed.role).toBe(agent.role);
    expect(parsed.description).toBe(agent.description);
    expect(parsed.model).toBe(agent.model);
    expect(parsed.category).toBe(agent.category);
    expect(parsed.temperature).toBe(agent.temperature);
    expect(parsed.maxTokens).toBe(agent.maxTokens);
    expect(parsed.timeout).toBe(agent.timeout);
    expect(parsed.reasoning).toEqual({ effort: 'medium', enabled: true });
    expect(parsed.previewPrompts).toEqual(agent.previewPrompts);
    expect(parsed.version).toBe(agent.version);
    expect(parsed.connectors).toEqual(['github-main']);
    expect(parsed.systemPrompt).toBe(agent.systemPrompt);
  });

  it('serializes the system prompt as the markdown body', () => {
    const file = serializeAgent(makeAgent({ systemPrompt: 'BODY-MARKER' }));
    const [, body] = file.split(/\n---\n/);
    expect(body).toContain('BODY-MARKER');
  });

  it('omits absent optional fields from frontmatter', () => {
    const agent = makeAgent({ description: undefined, previewPrompts: [], reasoning: undefined });
    const file = serializeAgent(agent);
    expect(file).not.toContain('description:');
    expect(file).not.toContain('previewPrompts:');
    expect(file).not.toContain('reasoning:');
  });

  it('throws when frontmatter is missing', () => {
    expect(() => parseAgent('no frontmatter here')).toThrow(/frontmatter/);
  });

  it('throws when a required field is missing', () => {
    const file = serializeAgent(makeAgent());
    const withoutModel = file.replace(/\nmodel: .*\n/, '\n');
    expect(() => parseAgent(withoutModel)).toThrow(/model/);
  });

  it('defaults role and version when blank', () => {
    const parsed = parseAgent('---\nid: a\nslug: s\nname: N\nmodel: m\n---\nhello');
    expect(parsed.role).toBe('Assistant');
    expect(parsed.version).toBe('1.0.0');
  });

  it('agentModelToDefinition normalizes empty previewPrompts to absent', () => {
    const def = agentModelToDefinition(makeAgent({ previewPrompts: [] }));
    expect(def.previewPrompts).toBeUndefined();
  });

  it('model -> definition -> file -> definition is stable', () => {
    const def1 = agentModelToDefinition(makeAgent());
    const def2 = parseAgent(serializeAgentDefinition(def1));
    expect(def2).toEqual(def1);
  });
});
