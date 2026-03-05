export function isPrivateIp(ip: string): boolean {
  const v = ip.trim();
  // IPv6 loopback / unique-local / link-local
  if (v === '::1') return true;
  if (/^fc00:/i.test(v) || /^fd00:/i.test(v)) return true; // ULA
  if (/^fe80:/i.test(v)) return true; // link-local

  // IPv4
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 169 && b === 254) return true; // link-local
  if (a === 0) return true;
  return false;
}

export function hostMatchesAllowlist(host: string, patterns: string[]): boolean {
  const h = host.trim().toLowerCase();
  for (const p0 of patterns) {
    const p = p0.trim().toLowerCase();
    if (!p) continue;
    if (p === h) return true;
    if (p.startsWith('*.') && h.endsWith(p.slice(1))) return true;
  }
  return false;
}

export function stripSqlCommentsAndTrim(sql: string): string {
  let s = String(sql ?? '');
  // Remove /* */ comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove -- comments
  s = s.replace(/--.*$/gm, ' ');
  return s.trim();
}

export function ensureSingleStatement(sql: string): string {
  let s = stripSqlCommentsAndTrim(sql);
  // Remove trailing semicolons
  s = s.replace(/;+\s*$/g, '').trim();
  if (s.includes(';')) {
    throw new Error('Multiple SQL statements are not allowed');
  }
  return s;
}

export function isReadOnlyStatement(sql: string): boolean {
  const s = stripSqlCommentsAndTrim(sql).toLowerCase();
  // Fast prefix check (common read-only entry points)
  const startsReadOnly = s.startsWith('select') || s.startsWith('with') || s.startsWith('show') || s.startsWith('explain');
  if (!startsReadOnly) return false;

  // Conservative keyword scan to prevent DML/DDL hidden inside CTEs, EXPLAIN, etc.
  // This is not a full SQL parser, but it blocks the most dangerous classes of statements.
  const forbidden = /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|vacuum|copy|call|execute)\b/i;
  return !forbidden.test(s);
}

