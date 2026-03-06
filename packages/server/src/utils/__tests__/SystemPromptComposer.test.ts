import { composeCanonicalSystemPrompt } from '../SystemPromptComposer';

describe('composeCanonicalSystemPrompt', () => {
  it('renders deterministic sections (thread context omitted)', () => {
    const out = composeCanonicalSystemPrompt({
      policyBlocks: ['POLICY_A', 'POLICY_B'],
      personaPrompt: 'PERSONA',
      starshipContext: 'WORLD',
      threadContext: {
        sourceConversationId: 'parent_123',
        sourceMessageId: 'msg_123',
        sourceRole: 'user',
        sourceUserName: 'Alice',
        sourceContent: 'Hello from parent',
      },
      history: { truncated: true, historyLimit: 30 },
    });

    expect(out).toContain('<starships_system_prompt>');
    expect(out).toContain('<section id="policy">');
    expect(out).toContain('POLICY_A');
    expect(out).toContain('POLICY_B');
    expect(out).toContain('<section id="persona">');
    expect(out).toContain('PERSONA');
    expect(out).toContain('<section id="world">');
    expect(out).toContain('WORLD');
    expect(out).not.toContain('<section id="conversation_context">');
    expect(out).not.toContain('Hello from parent');
    expect(out).toContain('<section id="history_policy">');
    expect(out).toContain('Only the most recent 30 messages are included');
    expect(out).toContain('</starships_system_prompt>');
  });

  it('omits history_policy when not truncated', () => {
    const out = composeCanonicalSystemPrompt({
      policyBlocks: ['P'],
      personaPrompt: 'PERSONA',
      starshipContext: 'WORLD',
      history: { truncated: false, historyLimit: 30 },
    });
    expect(out).not.toContain('<section id="history_policy">');
  });
});

