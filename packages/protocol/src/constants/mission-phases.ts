/**
 * Mission Phase Constants and UI Mapping
 * 
 * Centralized constants for mission phases with consistent UI labels,
 * descriptions, and visual properties.
 */

import { MissionPhase } from '../types/mission';

/**
 * Mission phase constants - use these instead of string literals
 */
export const MISSION_PHASES = {
  INIT: 'init' as const,
  WELCOME: 'welcome' as const,
  ANALYSIS: 'analysis' as const,
  PLAN: 'plan' as const,
  CONVERSE: 'converse' as const,
} as const;

/**
 * Mission phase configuration for UI display
 */
export interface MissionPhaseConfig {
  label: string;
  description: string;
  icon: string;
  color: {
    background: string;
    border: string;
    text: string;
  };
}

/**
 * Complete mission phase configuration mapping
 */
export const MISSION_PHASE_CONFIG: Record<MissionPhase, MissionPhaseConfig> = {
  [MISSION_PHASES.INIT]: {
    label: 'Initializing',
    description: 'Setting up mission context and preparing systems',
    icon: '⚙️',
    color: {
      background: 'bg-slate-100',
      border: 'border-slate-200',
      text: 'text-slate-800',
    },
  },
  [MISSION_PHASES.WELCOME]: {
    label: 'Welcome',
    description: 'Mission introduction and greeting',
    icon: '👋',
    color: {
      background: 'bg-blue-100',
      border: 'border-blue-200',
      text: 'text-blue-800',
    },
  },
  [MISSION_PHASES.ANALYSIS]: {
    label: 'Analysis',
    description: 'Analyzing mission clarity and requirements',
    icon: '🔍',
    color: {
      background: 'bg-amber-100',
      border: 'border-amber-200',
      text: 'text-amber-800',
    },
  },
  [MISSION_PHASES.PLAN]: {
    label: 'Planning',
    description: 'Reviewing and approving execution workflow',
    icon: '📋',
    color: {
      background: 'bg-purple-100',
      border: 'border-purple-200',
      text: 'text-purple-800',
    },
  },
  [MISSION_PHASES.CONVERSE]: {
    label: 'Active',
    description: 'Mission guidance and ongoing conversation',
    icon: '💬',
    color: {
      background: 'bg-green-100',
      border: 'border-green-200',
      text: 'text-green-800',
    },
  },
} as const;

/**
 * Helper function to get phase configuration
 */
export function getMissionPhaseConfig(phase: MissionPhase): MissionPhaseConfig {
  return MISSION_PHASE_CONFIG[phase] || {
    label: phase,
    description: 'Unknown phase',
    icon: '❓',
    color: {
      background: 'bg-gray-100',
      border: 'border-gray-200',
      text: 'text-gray-800',
    },
  };
}

/**
 * Helper function to check if a phase is valid
 */
export function isValidMissionPhase(phase: string): phase is MissionPhase {
  return Object.values(MISSION_PHASES).includes(phase as MissionPhase);
}

/**
 * Get all valid mission phases in order
 */
export function getMissionPhasesInOrder(): MissionPhase[] {
  return [
    MISSION_PHASES.INIT,
    MISSION_PHASES.WELCOME,
    MISSION_PHASES.ANALYSIS,
    MISSION_PHASES.PLAN,
    MISSION_PHASES.CONVERSE,
  ];
}

/**
 * Get the next phase in the mission lifecycle
 */
export function getNextMissionPhase(currentPhase: MissionPhase): MissionPhase | null {
  const phases = getMissionPhasesInOrder();
  const currentIndex = phases.indexOf(currentPhase);
  
  if (currentIndex === -1 || currentIndex === phases.length - 1) {
    return null; // Invalid phase or last phase
  }
  
  return phases[currentIndex + 1];
}

/**
 * Get the previous phase in the mission lifecycle
 */
export function getPreviousMissionPhase(currentPhase: MissionPhase): MissionPhase | null {
  const phases = getMissionPhasesInOrder();
  const currentIndex = phases.indexOf(currentPhase);
  
  if (currentIndex <= 0) {
    return null; // Invalid phase or first phase
  }
  
  return phases[currentIndex - 1];
}