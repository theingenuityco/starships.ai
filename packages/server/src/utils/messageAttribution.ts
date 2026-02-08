/**
 * Server-side helpers for Starships attribution headers.
 *
 * These headers are injected ONLY for internal traceability (e.g. when sending history to the LLM)
 * and may be echoed back by some models. They must never be persisted as user-facing content nor
 * sent to clients as part of `message.content`.
 *
 * Example header line:
 *   [2026-02-08T19:06:18.942Z] Jess (agent)
 */

export function stripStarshipsAttributionHeaderFromAssistantText(text: string): { stripped: number; text: string } {
  const s = typeof text === 'string' ? text : '';
  if (!s) return { stripped: 0, text: s };

  const lines = s.split('\n');
  let i = 0;
  // Skip leading blank lines
  while (i < lines.length && lines[i].trim().length === 0) i++;

  const isHeader = (line: string): boolean => {
    // Keep strict to avoid stripping legitimate assistant content.
    // We only strip the Starships attribution format that includes "(agent)" or "(user)".
    return /^\[\d{4}-\d{2}-\d{2}T[^\]]+\]\s+.+\s+\((agent|user)\)\s*$/i.test(line);
  };

  let stripped = 0;
  while (i < lines.length && isHeader(lines[i])) {
    stripped++;
    i++;
    if (stripped >= 6) break; // guard
    // Also strip immediate blank lines following header blocks
    while (i < lines.length && lines[i].trim().length === 0) i++;
  }

  if (stripped === 0) return { stripped: 0, text: s };
  return { stripped, text: lines.slice(i).join('\n') };
}

