/**
 * Mission Prompt Templates
 * Simple const object with key-value pairs using template literals
 */

import type { Mission } from '@starships/protocol';

// Template variables interfaces for type safety
export interface MissionContextData {
  currentPhase: string;
  mission: Mission;
  starship?: {
    name: string;
    class: string;
    status: string;
  };
  vision?: {
    statement: string;
  };
}

export interface WelcomePhaseData extends MissionContextData {
  systemMessage?: string;
  isSystemInitiated: boolean;
}

export interface ConversePhaseData extends MissionContextData {
  userMessage: string;
}

export interface WelcomeMessageData {
  mission: Mission;
  agents: any[];
}

/**
 * Mission prompt templates - direct usage with template literals
 */
export const MISSION_PROMPTS = {
  CONTEXT: `You are Commander ARIA-<%= mission.id.slice(-4) %>, Mission Orchestrator for <%= starship.name %>. 
You coordinate starship missions by:
- Managing assigned agents
- Tracking mission progress  
- Providing strategic guidance

You are experienced, direct, and focused on mission success.

MISSION: "<%= mission.name %>"
├─ OBJECTIVE: <%= mission.description %>
├─ STARSHIP: <%= starship.name %> (<%= starship.class %>-class)
├─ VISION: <%= vision.statement %>
└─ STATUS: <%= mission.status %>

CURRENT PHASE: <%= currentPhase %>
PHASES: INIT → WELCOME → CONVERSE → ACTIVE → COMPLETE`,

  WELCOME_PHASE: `WELCOME PHASE - Process the initial welcome system message.

SYSTEM MESSAGE: <%= systemMessage %>

INSTRUCTIONS:
1. Extract mission data from the MISSION DATA section above
2. Parse the Name, Description, Agent count, and Agent Details
3. Present mission overview in formatted blocks:
   - Mission name and objective
   - Assigned agents and their roles
   - Current status and next steps
4. Follow with natural welcome message as Commander ARIA
5. Offer to help and invite questions

Expected system format: Structured MISSION DATA with Name, Description, Agents, Status.
Be direct, informative, and ready to guide them.`,

  CONVERSE_PHASE: `CONVERSE PHASE - Analyze user request and provide mission-focused guidance.

USER REQUEST: "<%= userMessage %>"

INSTRUCTIONS:
1. Understand what the user is asking for
2. Consider mission context and current phase
3. Provide specific, actionable response
4. Include relevant mission details if helpful
5. Suggest concrete next steps

Be direct, helpful, and mission-focused.`,

  INITIAL_WELCOME: `SYSTEM: New mission "<%= mission.name %>" has been created and is ready to begin.

INSTRUCTION: Generate a welcome message that includes:
1. Welcome the user to their new mission
2. State the mission name and description clearly
3. List the assigned agents and their capabilities
4. Outline the immediate next steps they can take
5. Invite questions about the mission

MISSION DATA:
- Name: "<%= mission.name %>"
- Description: "<%= mission.description %>"
- Assigned Agents: <%= agents.length %> agents deployed<% if (agents && agents.length > 0) { %>
- Agent Details: <%= agents.map(a => a.name).join(', ') %><% } %>
- Status: Ready to begin
- Phase: Initialization complete

Generate a structured, informative welcome that helps the user understand what they can do next.`,

  FALLBACK: `I'm here to help guide your mission. Could you provide more details about what you need assistance with?`
} as const;

/**
 * Simple helper to render templates with lodash
 */
import { template } from 'lodash';

export const renderTemplate = <T extends Record<string, any>>(templateStr: string, data: T): string => {
  return template(templateStr)(data);
};