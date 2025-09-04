/**
 * Mission Phase UI Configuration
 *
 * Client-side UI configuration for mission phases including colors, icons, and display properties.
 */

import { MissionPhase, MISSION_PHASES } from '@starships/protocol'

/**
 * Mission phase configuration for UI display
 */
export interface MissionPhaseConfig {
  label: string
  description: string
  icon: string
  color: {
    background: string
    border: string
    text: string
  }
}

/**
 * Complete mission phase configuration mapping for UI
 */
export const MISSION_PHASE_CONFIG: Record<MissionPhase, MissionPhaseConfig> = {
  [MISSION_PHASES.WELCOME]: {
    label: 'Welcome',
    description: 'Mission introduction and getting started',
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
  [MISSION_PHASES.EXECUTE]: {
    label: 'Execution',
    description: 'Running mission workflow tasks',
    icon: '⚡',
    color: {
      background: 'bg-orange-100',
      border: 'border-orange-200',
      text: 'text-orange-800',
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
} as const

/**
 * Helper function to get phase configuration for UI
 */
export function getMissionPhaseConfig(phase: MissionPhase): MissionPhaseConfig {
  return (
    MISSION_PHASE_CONFIG[phase] || {
      label: phase,
      description: 'Unknown phase',
      icon: '❓',
      color: {
        background: 'bg-gray-100',
        border: 'border-gray-200',
        text: 'text-gray-800',
      },
    }
  )
}

/**
 * Get all valid mission phases in order (UI utility)
 */
export function getMissionPhasesInOrder(): MissionPhase[] {
  return [MISSION_PHASES.WELCOME, MISSION_PHASES.ANALYSIS, MISSION_PHASES.PLAN, MISSION_PHASES.EXECUTE, MISSION_PHASES.CONVERSE]
}

/**
 * Get the next phase in the mission lifecycle (UI utility)
 */
export function getNextMissionPhase(currentPhase: MissionPhase): MissionPhase | null {
  const phases = getMissionPhasesInOrder()
  const currentIndex = phases.indexOf(currentPhase)

  if (currentIndex === -1 || currentIndex === phases.length - 1) {
    return null // Invalid phase or last phase
  }

  return phases[currentIndex + 1]
}

/**
 * Get the previous phase in the mission lifecycle (UI utility)
 */
export function getPreviousMissionPhase(currentPhase: MissionPhase): MissionPhase | null {
  const phases = getMissionPhasesInOrder()
  const currentIndex = phases.indexOf(currentPhase)

  if (currentIndex <= 0) {
    return null // Invalid phase or first phase
  }

  return phases[currentIndex - 1]
}
