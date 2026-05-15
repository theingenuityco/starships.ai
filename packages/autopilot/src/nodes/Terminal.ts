/**
 * Terminal Node
 *
 * Executes a shell command on the server machine via child_process.exec.
 * Non-zero exit codes are returned in the result (stdout/stderr/exitCode) rather
 * than thrown, so the calling blueprint can decide how to handle failures.
 * A spawn-level error (e.g. invalid binary) will throw.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseNode } from './BaseNode';
import { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import type { TerminalParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 30_000;

export class Terminal extends BaseNode<TerminalParams> {
  constructor(params: TerminalParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    const timeoutMs = params.timeout ?? DEFAULT_TIMEOUT_MS;

    try {
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: params.workingDirectory,
        timeout: timeoutMs,
        env: params.env ? { ...process.env, ...params.env } : process.env,
      });

      return ExecutionItemUtils.wrapSingle(
        { command: params.command, stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode: 0 },
        input?.[0]
      );
    } catch (error: unknown) {
      // exec rejects with an ExecException on non-zero exit — surface result rather than throw
      if (isExecException(error)) {
        return ExecutionItemUtils.wrapSingle(
          {
            command: params.command,
            stdout: typeof error.stdout === 'string' ? error.stdout.trimEnd() : '',
            stderr: typeof error.stderr === 'string' ? error.stderr.trimEnd() : '',
            exitCode: error.code ?? 1,
          },
          input?.[0]
        );
      }
      throw this.handleExecutionError(error, 'Terminal execution failed');
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    const commandError = this.validateRequiredField(params.command, 'Command');
    if (commandError) errors.push(commandError);

    if (params.timeout !== undefined) {
      const timeoutError = this.validateMinimumValue(params.timeout, 'Timeout', 1000);
      if (timeoutError) errors.push(timeoutError);
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}

interface ExecException {
  code?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
}

function isExecException(error: unknown): error is ExecException {
  return typeof error === 'object' && error !== null && ('stdout' in error || 'stderr' in error || 'code' in error);
}
