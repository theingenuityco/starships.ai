/**
 * Mission Prompt Templates
 * Simple const object with key-value pairs using template literals
 */

import type { Mission } from '@starships/protocol';

// Template variables interfaces for type safety
export interface MissionContextData {
  activePhase: string;
  mission: Mission;
  starship?: {
    name: string;
    class: string;
    status: string;
  };
  vision?: {
    statement: string;
  };
  clarity?: {
    overallScore: number;
    iteration: number;
    objectiveClarity: number;
    successMetrics: number;
    timelineDefinition: number;
    scopeBoundaries: number;
    visionAlignment: number;
    reasoning: string;
  };
}

export interface WelcomePhaseData extends MissionContextData {
  systemMessage?: string;
  isSystemInitiated: boolean;
}

export interface ConversePhaseData extends MissionContextData {
  userMessage: string;
}

export interface AnalysisPhaseData extends MissionContextData {
  userMessage: string;
}

export interface WelcomeMessageData {
  mission: Mission;
  agents: any[];
}

/**
 * Legacy mission prompt templates - DEPRECATED
 * 
 * Most prompts have been migrated to MissionPromptBuilder.
 * Only keeping templates still used by other services.
 */
export const MISSION_PROMPTS = {
  // Used by MissionService for initial welcome messages
  INITIAL_WELCOME: `New mission "<%= mission.name %>" is ready.

Generate a brief welcome with:
- Mission name and description
- Ready to begin
- Ask them to hold on while you assess the mission objective for clarity

MISSION DATA:
- Name: "<%= mission.name %>"
- Description: "<%= mission.description %>"
- Status: Ready to begin`
} as const;

/**
 * Simple helper to render templates with lodash
 */
import { template } from 'lodash';

export const renderTemplate = <T extends Record<string, any>>(templateStr: string, data: T): string => {
  return template(templateStr)(data);
};