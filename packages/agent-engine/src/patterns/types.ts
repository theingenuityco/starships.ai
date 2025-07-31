/**
 * Types for MCP Tool Usage Patterns
 */

export interface PatternExample {
  name: string;
  description: string;
  scenario: string;
  tools: string[];
  code: string;
  expectedOutcome: string;
}

export interface UsageScenario {
  id: string;
  title: string;
  description: string;
  requiredTools: string[];
  steps: ScenarioStep[];
  bestPractices: string[];
  pitfalls: string[];
}

export interface ScenarioStep {
  order: number;
  action: string;
  tool: string;
  input: any;
  expectedOutput: any;
  notes?: string;
}