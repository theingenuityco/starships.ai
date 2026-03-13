export type ToolPermission = 'allow' | 'ask' | 'deny';

export function normalizePermission(value: unknown): ToolPermission {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === 'allow' || v === 'ask' || v === 'deny') return v;
  return 'allow';
}

