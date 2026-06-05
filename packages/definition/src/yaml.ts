import * as yaml from 'js-yaml';

/** Shared YAML helpers for the YAML-backed definition codecs (connectors/tables/schedules). */

/** Build an object with a deliberate key order, dropping null/undefined values. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as Partial<T>;
}

/** Serialize an object to a stable, readable YAML document. */
export function dumpYaml(obj: Record<string, unknown>): string {
  return yaml.dump(obj, { sortKeys: false, lineWidth: -1, noRefs: true });
}

/** Parse a YAML document, requiring a top-level mapping. */
export function loadYaml(raw: string): Record<string, unknown> {
  const value = yaml.load(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('definition file is not a YAML mapping');
  }
  return value as Record<string, unknown>;
}

/** Coerce a required non-empty string field or throw with the field name. */
export function requireString(data: Record<string, unknown>, key: string, kind: string): string {
  const v = data[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`${kind} definition field '${key}' must be a non-empty string`);
  }
  return v;
}
