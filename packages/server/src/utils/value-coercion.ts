export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  }
  return null;
}

export function toIsoDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function toIsoInstant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isIsoInstantStringWithOffset(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s) return false;
  // Require an explicit offset or Z (to avoid ambiguous local-time strings).
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(s);
}

export function toIsoInstantWithOffset(value: unknown): string | null {
  if (!isIsoInstantStringWithOffset(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

