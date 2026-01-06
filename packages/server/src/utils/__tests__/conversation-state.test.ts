/**
 * Unit tests for conversation state management utilities
 */

import {
  resolvePlugins,
  mergeConversationState,
  extractPersistableState,
  hasPlugins,
  normalizeStateForComparison,
} from '../conversation-state';
import type { ConversationState, AgentState, ConversationPlugin } from '@starships/protocol';

describe('conversation-state utilities', () => {
  describe('resolvePlugins', () => {
    it('should return undefined when no plugins are set', () => {
      expect(resolvePlugins(undefined, undefined)).toBeUndefined();
      expect(resolvePlugins({}, {})).toBeUndefined();
      expect(resolvePlugins({ plugins: undefined }, {})).toBeUndefined();
      expect(resolvePlugins({ plugins: null }, {})).toBeUndefined();
    });

    it('should return empty array when plugins is explicitly empty', () => {
      const result = resolvePlugins({ plugins: [] }, {});
      expect(result).toEqual([]);
    });

    it('should return plugins from conversation state', () => {
      const plugins: ConversationPlugin[] = [{ id: 'web', max_results: 3 }];
      const result = resolvePlugins({ plugins }, {});
      expect(result).toEqual(plugins);
    });

    it('should ignore agent plugins', () => {
      const conversationState: ConversationState = { plugins: [{ id: 'web' }] };
      const agentState: AgentState = { plugins: [{ id: 'other' }] };
      const result = resolvePlugins(conversationState, agentState);
      expect(result).toEqual([{ id: 'web' }]);
    });

    it('should filter out invalid plugins', () => {
      const state = {
        plugins: [
          { id: 'web', max_results: 3 },
          { id: '', max_results: 2 }, // Invalid: empty id
          { id: 'valid' },
          { id: 'invalid', max_results: -1 }, // Invalid: negative
          { id: 'invalid2', max_results: 1.5 }, // Invalid: not integer
        ],
      };
      const result = resolvePlugins(state, {});
      expect(result).toEqual([
        { id: 'web', max_results: 3 },
        { id: 'valid' },
      ]);
    });

    it('should handle conversation state with plugins as null', () => {
      expect(resolvePlugins({ plugins: null }, {})).toBeUndefined();
    });
  });

  describe('mergeConversationState', () => {
    it('should merge states correctly', () => {
      const existing: ConversationState = { plugins: [{ id: 'web' }], otherField: 'value' };
      const updates: Partial<ConversationState> = { otherField: 'updated' };
      const result = mergeConversationState(existing, updates);
      expect(result).toEqual({
        plugins: [{ id: 'web' }],
        otherField: 'updated',
      });
    });

    it('should handle null plugins by removing them', () => {
      const existing: ConversationState = { plugins: [{ id: 'web' }] };
      const updates: Partial<ConversationState> = { plugins: null };
      const result = mergeConversationState(existing, updates);
      expect(result).not.toHaveProperty('plugins');
    });

    it('should create new state from updates when existing is undefined', () => {
      const updates: Partial<ConversationState> = { plugins: [{ id: 'web' }] };
      const result = mergeConversationState(undefined, updates);
      expect(result).toEqual(updates);
    });
  });

  describe('extractPersistableState', () => {
    it('should return null for undefined or invalid input', () => {
      expect(extractPersistableState(undefined)).toBeNull();
      expect(extractPersistableState(null as any)).toBeNull();
    });

    it('should exclude blacklisted fields', () => {
      const executionState = {
        messages: ['msg1'],
        tools: ['tool1'],
        modalities: ['text'],
        imageConfig: { aspect_ratio: '1:1' },
        plugins: [{ id: 'web' }],
        otherField: 'value',
      };
      const result = extractPersistableState(executionState);
      expect(result).toEqual({ otherField: 'value' });
      expect(result).not.toHaveProperty('messages');
      expect(result).not.toHaveProperty('tools');
      expect(result).not.toHaveProperty('modalities');
      expect(result).not.toHaveProperty('imageConfig');
      expect(result).not.toHaveProperty('plugins');
    });

    it('should return null when only blacklisted fields are present', () => {
      const executionState = {
        messages: ['msg1'],
        tools: ['tool1'],
      };
      const result = extractPersistableState(executionState);
      expect(result).toBeNull();
    });
  });

  describe('hasPlugins', () => {
    it('should return false for undefined or invalid state', () => {
      expect(hasPlugins(undefined)).toBe(false);
      expect(hasPlugins(null as any)).toBe(false);
      expect(hasPlugins({})).toBe(false);
    });

    it('should return true when plugins array has items', () => {
      expect(hasPlugins({ plugins: [{ id: 'web' }] })).toBe(true);
      expect(hasPlugins({ plugins: [{ id: 'web' }, { id: 'other' }] })).toBe(true);
    });

    it('should return false when plugins is empty array', () => {
      expect(hasPlugins({ plugins: [] })).toBe(false);
    });

    it('should return false when plugins is null or undefined', () => {
      expect(hasPlugins({ plugins: null })).toBe(false);
      expect(hasPlugins({ plugins: undefined })).toBe(false);
    });
  });

  describe('normalizeStateForComparison', () => {
    it('should remove undefined plugins', () => {
      const state = { plugins: undefined, otherField: 'value' };
      const result = normalizeStateForComparison(state);
      expect(result).not.toHaveProperty('plugins');
      expect(result).toEqual({ otherField: 'value' });
    });

    it('should preserve defined plugins', () => {
      const state = { plugins: [{ id: 'web' }], otherField: 'value' };
      const result = normalizeStateForComparison(state);
      expect(result).toHaveProperty('plugins');
      expect(result.plugins).toEqual([{ id: 'web' }]);
    });

    it('should handle empty state', () => {
      expect(normalizeStateForComparison({})).toEqual({});
    });

    it('should ensure messages and tools arrays exist if in state', () => {
      const state = { messages: undefined, tools: undefined };
      const result = normalizeStateForComparison(state);
      expect(result.messages).toEqual([]);
      expect(result.tools).toEqual([]);
    });
  });
});

