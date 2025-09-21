/**
 * Agent Memory System
 *
 * DEPRECATED: This file is deprecated as Agent now manages state directly
 * using AgentState interface from node-parameters.ts
 *
 * This file is kept for backward compatibility during transition
 */

// AgentMemoryState and AgentMemory class are deprecated
// Agent now manages state directly using AgentState interface
// This file is kept for backward compatibility during transition

// Legacy exports for backward compatibility (will be removed)
export interface AgentIdentity {
  name?: string;
  role?: string;
  personality?: string;
  expertise?: string[];
}

export interface AgentPurpose {
  primary: string;
  secondary?: string[];
  constraints?: string[];
}

export interface AgentSpace {
  description: string;
}
