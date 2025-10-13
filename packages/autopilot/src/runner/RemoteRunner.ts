import type { Runner } from './Runner';
import type { Blueprint, Execution, ExecutionItem } from '@/types';
import type { EngineConfig } from '@/engine/Engine';
import { nanoid } from 'nanoid';
import { autopilot } from '@/Autopilot';

export class RemoteRunner implements Runner {
  private readonly baseUrl: string;
  private readonly authToken?: string;

  constructor() {
    const cfg = autopilot.getConfig();
    const url = cfg.remoteRunnerUrl;
    if (!url) {
      throw new Error('RemoteRunner URL not configured. Call autopilot.setRunnerConfig({ url, token })');
    }
    this.baseUrl = url;
    this.authToken = cfg.remoteRunnerToken;
  }

  async run(blueprint: Blueprint, execution: Execution, config?: EngineConfig): Promise<ExecutionItem[]> {
    const requestId = nanoid();
    const payload: Record<string, unknown> = {
      blueprint_json: JSON.stringify(blueprint),
      execution_json: JSON.stringify(execution),
      config_json: JSON.stringify({ ...(config || {}), eventCallback: undefined }),
      request_id: requestId,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    const url = `${this.baseUrl}/runner.Runner/Execute`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Remote runner error: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { result_json?: string };
    const result = body?.result_json ? JSON.parse(body.result_json) : undefined;
    return Array.isArray(result) ? (result as ExecutionItem[]) : [];
  }
}
