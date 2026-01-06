/**
 * Unit tests for agent state management utilities (client-side)
 */

import {
  areStatesEqual,
  baseStateHasPlugins,
  nextStateHasPlugins,
  shouldSkipStateUpdateToPreservePlugins,
} from '../agent-state';
import type { ConversationState } from '@starships/protocol';

describe('agent-state utilities', () => {
  describe('areStatesEqual', () => {
    it('should return true for undefined states', () => {
      expect(areStatesEqual(undefined, undefined)).toBe(true);
    });

    it('should return false when one state is undefined', () => {
      expect(areStatesEqual(undefined, {})).toBe(false);
      expect(areStatesEqual({}, undefined)).toBe(false);
    });

    it('should return true for identical states', () => {
      const state: ConversationState = { plugins: [{ id: 'web' }] };
      expect(areStatesEqual(state, state)).toBe(true);
      expect(areStatesEqual(state, { ...state })).toBe(true);
    });

    it('should return false for different states', () => {
      const state1: ConversationState = { plugins: [{ id: 'web' }] };
      const state2: ConversationState = { plugins: [{ id: 'other' }] };
      expect(areStatesEqual(state1, state2)).toBe(false);
    });

    it('should handle undefined plugins consistently', () => {
      const state1 = { plugins: undefined };
      const state2 = {};
      expect(areStatesEqual(state1, state2)).toBe(true);
    });
  });

  describe('baseStateHasPlugins', () => {
    it('should return false for undefined or invalid state', () => {
      expect(baseStateHasPlugins(undefined)).toBe(false);
      expect(baseStateHasPlugins(null as any)).toBe(false);
      expect(baseStateHasPlugins({})).toBe(false);
    });

    it('should return true when plugins array has items', () => {
      expect(baseStateHasPlugins({ plugins: [{ id: 'web' }] })).toBe(true);
    });

    it('should return false when plugins is empty array', () => {
      expect(baseStateHasPlugins({ plugins: [] })).toBe(false);
    });
  });

  describe('nextStateHasPlugins', () => {
    it('should return false for undefined or invalid state', () => {
      expect(nextStateHasPlugins(undefined)).toBe(false);
      expect(nextStateHasPlugins(null as any)).toBe(false);
      expect(nextStateHasPlugins({})).toBe(false);
    });

    it('should return true when plugins array has items', () => {
      expect(nextStateHasPlugins({ plugins: [{ id: 'web' }] })).toBe(true);
    });

    it('should return false when plugins is empty array', () => {
      expect(nextStateHasPlugins({ plugins: [] })).toBe(false);
    });
  });

  describe('shouldSkipStateUpdateToPreservePlugins', () => {
    it('should return true when base has plugins but next does not', () => {
      const base: ConversationState = { plugins: [{ id: 'web' }] };
      const next: ConversationState = {};
      expect(shouldSkipStateUpdateToPreservePlugins(base, next)).toBe(true);
    });

    it('should return false when both have plugins', () => {
      const base: ConversationState = { plugins: [{ id: 'web' }] };
      const next: ConversationState = { plugins: [{ id: 'web' }] };
      expect(shouldSkipStateUpdateToPreservePlugins(base, next)).toBe(false);
    });

    it('should return false when neither has plugins', () => {
      const base: ConversationState = {};
      const next: ConversationState = {};
      expect(shouldSkipStateUpdateToPreservePlugins(base, next)).toBe(false);
    });

    it('should return false when next has plugins but base does not', () => {
      const base: ConversationState = {};
      const next: ConversationState = { plugins: [{ id: 'web' }] };
      expect(shouldSkipStateUpdateToPreservePlugins(base, next)).toBe(false);
    });
  });
});

