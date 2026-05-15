/**
 * FileSystem Node
 *
 * Performs file-system operations on the server machine using Node.js fs/promises.
 * Supported operations: read, write, append, delete, list, exists.
 */

import { readFile, writeFile, appendFile, unlink, readdir, stat, access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { resolve } from 'path';
import { BaseNode } from './BaseNode';
import { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import type { FileSystemParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class FileSystem extends BaseNode<FileSystemParams> {
  constructor(params: FileSystemParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    // Strip leading `/` so paths like "/README.md" resolve relative to cwd, not OS root
    // Strip leading `/` so paths like "/README.md" resolve relative to cwd, not OS root
    const normalizedPath = params.path.startsWith('/') ? params.path.slice(1) : params.path;
    const absPath = resolve(normalizedPath);
    const cwd = process.cwd();
    if (absPath !== cwd && !absPath.startsWith(cwd + require('path').sep)) {
      throw new Error(`Path '${params.path}' escapes the workspace boundary`);
    }
    const pairedItem = input?.[0];

    try {
      switch (params.operation) {
        case 'read': {
          const encoding = params.encoding ?? 'utf-8';
          if (encoding === 'base64') {
            const buf = await readFile(absPath);
            return ExecutionItemUtils.wrapSingle({ content: buf.toString('base64'), path: absPath }, pairedItem);
          }
          const content = await readFile(absPath, 'utf-8');
          return ExecutionItemUtils.wrapSingle({ content, path: absPath }, pairedItem);
        }

        case 'write': {
          const data = params.content ?? '';
          const encoding = params.encoding === 'base64' ? 'base64' : 'utf-8';
          await writeFile(absPath, data, encoding);
          return ExecutionItemUtils.wrapSingle({ ok: true, path: absPath, bytesWritten: Buffer.byteLength(data, encoding) }, pairedItem);
        }

        case 'append': {
          const data = params.content ?? '';
          await appendFile(absPath, data, 'utf-8');
          return ExecutionItemUtils.wrapSingle({ ok: true, path: absPath, bytesWritten: Buffer.byteLength(data, 'utf-8') }, pairedItem);
        }

        case 'delete': {
          await unlink(absPath);
          return ExecutionItemUtils.wrapSingle({ ok: true, path: absPath }, pairedItem);
        }

        case 'list': {
          const names = await readdir(absPath);
          const entries = await Promise.all(
            names.map(async (name) => {
              try {
                const s = await stat(resolve(absPath, name));
                return { name, type: s.isDirectory() ? 'directory' : 'file', size: s.isFile() ? s.size : undefined };
              } catch {
                return { name, type: 'unknown' as const };
              }
            })
          );
          return ExecutionItemUtils.wrapSingle({ entries, path: absPath }, pairedItem);
        }

        case 'exists': {
          let exists = true;
          try {
            await access(absPath, fsConstants.F_OK);
          } catch {
            exists = false;
          }
          return ExecutionItemUtils.wrapSingle({ exists, path: absPath }, pairedItem);
        }

        default: {
          throw new Error(`Unknown file system operation: ${(params as FileSystemParams).operation}`);
        }
      }
    } catch (error) {
      throw this.handleExecutionError(error, `FileSystem operation '${params.operation}' failed on '${absPath}'`);
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    const pathError = this.validateRequiredField(params.path, 'Path');
    if (pathError) errors.push(pathError);

    const validOps = ['read', 'write', 'append', 'delete', 'list', 'exists'];
    if (!params.operation || !validOps.includes(params.operation)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: `Operation must be one of: ${validOps.join(', ')}`,
      });
    }

    if ((params.operation === 'write' || params.operation === 'append') && params.content === undefined) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: `Content is required for '${params.operation}' operation`,
      });
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
