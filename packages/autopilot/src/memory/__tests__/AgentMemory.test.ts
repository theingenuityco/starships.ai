/**
 * Agent Memory Tests - DEPRECATED
 *
 * This test file is deprecated as AgentMemory class is no longer used.
 * Agent now manages state directly using AgentState interface.
 *
 * This file is kept for backward compatibility during transition.
 */

describe('Agent Memory - DEPRECATED', () => {
  it('should be deprecated', () => {
    expect(true).toBe(true);
    console.warn('AgentMemory class is deprecated. Use AgentState interface instead.');
  });
});
