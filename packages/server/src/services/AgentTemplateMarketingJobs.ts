import { randomUUID } from 'crypto';

export type AgentTemplateMarketingJobStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentTemplateMarketingJobStatus = 'running' | 'completed' | 'failed';

export type AgentTemplateMarketingStepKey =
  | 'validate_admin'
  | 'load_template'
  | 'resolve_parent_agent'
  | 'build_runner_bundle'
  | 'generate_avatar'
  | 'generate_problem_statements'
  | 'generate_profile_images'
  | 'persist_template_assets'
  | 'revalidate';

export interface AgentTemplateMarketingJobStep {
  key: AgentTemplateMarketingStepKey;
  label: string;
  status: AgentTemplateMarketingJobStepStatus;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface AgentTemplateMarketingJob {
  id: string;
  templateId: string;
  startedByUserId: string;
  status: AgentTemplateMarketingJobStatus;
  createdAt: string;
  updatedAt: string;
  steps: AgentTemplateMarketingJobStep[];
  result?: {
    templateId: string;
    marketingContent: {
      avatarUrl?: string;
      problemStatementsText?: string[];
      problemStatementsImageUrl?: string;
      capabilitiesImageUrl?: string;
      tryThesePromptsImageUrl?: string;
    };
  };
  error?: string;
}

const JOB_TTL_MS = 1000 * 60 * 60; // 1 hour
const jobs = new Map<string, AgentTemplateMarketingJob>();

function nowIso(): string {
  return new Date().toISOString();
}

function stepLabel(key: AgentTemplateMarketingStepKey): string {
  switch (key) {
    case 'validate_admin':
      return 'Validating permissions';
    case 'load_template':
      return 'Loading template';
    case 'resolve_parent_agent':
      return 'Resolving parent agent context';
    case 'build_runner_bundle':
      return 'Preparing runner bundle';
    case 'generate_avatar':
      return 'Generating avatar';
    case 'generate_problem_statements':
      return 'Generating problem statements';
    case 'generate_profile_images':
      return 'Generating profile images';
    case 'persist_template_assets':
      return 'Saving assets to template';
    case 'revalidate':
      return 'Refreshing marketplace cache';
    default:
      return String(key);
  }
}

function freshSteps(): AgentTemplateMarketingJobStep[] {
  const keys: AgentTemplateMarketingStepKey[] = [
    'validate_admin',
    'load_template',
    'resolve_parent_agent',
    'build_runner_bundle',
    'generate_avatar',
    'generate_problem_statements',
    'generate_profile_images',
    'persist_template_assets',
    'revalidate',
  ];
  return keys.map((key) => ({ key, label: stepLabel(key), status: 'pending' }));
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const createdAt = Date.parse(job.createdAt);
    if (Number.isFinite(createdAt) && now - createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

export function createAgentTemplateMarketingJob(templateId: string, startedByUserId: string): AgentTemplateMarketingJob {
  cleanupExpired();
  const createdAt = nowIso();
  const job: AgentTemplateMarketingJob = {
    id: randomUUID(),
    templateId,
    startedByUserId,
    status: 'running',
    createdAt,
    updatedAt: createdAt,
    steps: freshSteps(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getAgentTemplateMarketingJob(jobId: string): AgentTemplateMarketingJob | null {
  cleanupExpired();
  const job = jobs.get(jobId);
  return job ?? null;
}

export function markJobStep(
  jobId: string,
  key: AgentTemplateMarketingStepKey,
  status: AgentTemplateMarketingJobStepStatus,
  extra?: { error?: string }
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  const step = job.steps.find((s) => s.key === key);
  if (!step) return;

  const t = nowIso();
  if (status === 'running' && !step.startedAt) step.startedAt = t;
  if ((status === 'completed' || status === 'failed') && !step.endedAt) step.endedAt = t;
  step.status = status;
  if (extra?.error) step.error = extra.error;
  job.updatedAt = t;
}

export function completeAgentTemplateMarketingJob(
  jobId: string,
  result: AgentTemplateMarketingJob['result']
): AgentTemplateMarketingJob | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.status = 'completed';
  job.result = result;
  job.updatedAt = nowIso();
  return job;
}

export function failAgentTemplateMarketingJob(jobId: string, error: unknown): AgentTemplateMarketingJob | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.status = 'failed';
  job.error = error instanceof Error ? error.message : String(error);
  job.updatedAt = nowIso();
  return job;
}

