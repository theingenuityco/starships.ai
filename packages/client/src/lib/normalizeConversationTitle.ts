export function normalizeConversationTitle(raw: string): string {
  const t = String(raw || '').trim()
  if (!t) return t
  // Back-compat: older DM conversations were titled like "DM • Alice".
  const m = t.match(/^DM\s*[•·:\-–—]\s*(.+)$/i)
  if (m?.[1]) {
    const rest = String(m[1]).trim()
    return rest || t
  }
  // Back-compat: older thread titles were created like "Thread: <snippet>".
  const tm = t.match(/^Thread\s*:\s*(.+)$/i)
  if (tm?.[1]) {
    const rest = String(tm[1]).trim()
    return rest || t
  }
  return t
}
