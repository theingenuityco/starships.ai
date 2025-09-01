/**
 * Mission Prompt Templates
 * Simple const object with key-value pairs using template literals
 */

import type { MissionModel } from '@starships/protocol';

// Template variables interfaces for type safety
export interface MissionContextData {
  activePhase: string;
  mission: MissionModel;
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
  mission: MissionModel;
  agents: any[];
}

/**
 * Legacy mission prompt templates - DEPRECATED
 * 
 * All prompts have been migrated to MissionPromptBuilder.
 * This file can be removed once renderTemplate is no longer used elsewhere.
 */

/**
 * Simple helper to render templates with lodash
 */
import { template } from 'lodash';

export const renderTemplate = <T extends Record<string, any>>(templateStr: string, data: T): string => {
  return template(templateStr)(data);
};