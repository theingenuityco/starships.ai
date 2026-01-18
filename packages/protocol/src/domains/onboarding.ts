/**
 * Onboarding Types
 *
 * Contract for the multi-step onboarding experience.
 */

import type { AgentTemplateModel } from './agent-template';

export type OnboardingGoal =
  | 'research'
  | 'analytics'
  | 'support'
  | 'automation'
  | 'tool_building';

export type OnboardingStep =
  | 'welcome'
  | 'goals'
  | 'connectors'
  | 'agents'
  | 'first_task'
  | 'done';

export interface OnboardingSessionModel {
  userId: string;
  starshipId: string | null;
  step: OnboardingStep;
  goals: OnboardingGoal[];
  selectedConnectorProviders: string[];
  selectedAgentTemplateIds: string[];
  primaryAgentTemplateId?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingStartResponse {
  session: OnboardingSessionModel;
  starship?: { id: string; slug: string; name: string } | null;
  ariaAgent?: { id: string; slug: string; name: string } | null;
}

export interface OnboardingRecommendationsRequest {
  goals: OnboardingGoal[];
  constraints?: Record<string, unknown>;
}

export interface OnboardingConnectorSummary {
  provider: string;
  status?: string;
  authType?: string;
  scopes?: string[];
  actions?: Array<{ name: string; schema?: Record<string, unknown> }>;
}

export interface OnboardingRecommendationsResponse {
  connectors: OnboardingConnectorSummary[];
  recommendedConnectorProviders: string[];
  recommendedAgentTemplates: AgentTemplateModel[];
}

export interface OnboardingApplySelectionRequest {
  selectedAgentTemplateIds: string[];
  primaryAgentTemplateId?: string | null;
}

export interface OnboardingApplySelectionResponse {
  session: OnboardingSessionModel;
  deployedAgents: Array<{ id: string; slug: string; name: string; sourceTemplateId?: string | null }>;
}

export interface OnboardingFinishResponse {
  session: OnboardingSessionModel;
  starship: { id: string; slug: string; name: string };
  primaryAgent: { id: string; slug: string; name: string };
}

export interface OnboardingAriaSuggestRequest {
  step: OnboardingStep;
  goals?: OnboardingGoal[];
  userNotes?: string;
}

export interface OnboardingAriaSuggestResponse {
  explanationMarkdown: string;
  recommendedConnectorProviders: string[];
  recommendedAgentTemplates: AgentTemplateModel[];
}

