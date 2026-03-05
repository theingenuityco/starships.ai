import { ConversationService } from '../ConversationService';

describe('ConversationService.filterMessagesForLlmHistory', () => {
  it('excludes role=system and preserves order', () => {
    const input = [
      { id: '1', role: 'system', content: 'SYS' },
      { id: '2', role: 'user', content: 'U' },
      { id: '3', role: 'assistant', content: 'A' },
      { id: '4', role: 'tool', content: 'T' },
      { id: '5', role: 'system', content: 'SYS2' },
    ];

    const out = ConversationService.filterMessagesForLlmHistory(input);
    expect(out.map((m) => m.id)).toEqual(['2', '3', '4']);
  });
});

