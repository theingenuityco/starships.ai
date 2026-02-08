/**
 * UI-only helpers for attribution headers injected/echoed in agent messages.
 *
 * Background:
 * - The server injects an attribution header line into messages *sent to the LLM* (e.g. `[ISO] Jess (agent)`),
 *   and some models may echo that line back in their assistant response.
 * - That header is metadata for traceability/logging and must never be shown to end-users.
 *
 * IMPORTANT:
 * - This module MUST NOT change persisted message content.
 * - It is safe to use anywhere we render message content or build user-facing snippets.
 */

export function stripStarshipsAttributionHeadersForDisplay(args: {
  /** Message role, used to avoid stripping user-authored content. */
  role: string | null | undefined
  /** Raw message text (as stored/streamed). */
  text: string | null | undefined
}): { stripped: number; text: string } {
  const role = String(args.role || '').trim()
  const input = typeof args.text === 'string' ? args.text : ''
  if (!input) return { stripped: 0, text: input }

  // Only strip assistant messages; users may intentionally paste bracketed timestamps.
  if (role !== 'assistant') return { stripped: 0, text: input }

  const lines = input.split('\n')
  let i = 0
  // Skip leading blank lines.
  while (i < lines.length && lines[i].trim().length === 0) i++
  if (i >= lines.length) return { stripped: 0, text: input }

  const looksLikeHeader = (line: string): boolean => {
    // Expected (server-injected) format:
    //   [2026-02-08T19:06:18.942Z] Jess (agent)
    // Also accept "(user)" and allow any non-empty sender label.
    //
    // Keep this fairly strict to avoid stripping legitimate content.
    return /^\[\d{4}-\d{2}-\d{2}T[^\]]+\]\s+.+\s+\((agent|user)\)\s*$/.test(line)
  }

  let stripped = 0
  // Guard against runaway repetition: strip at most a handful of header blocks.
  while (i < lines.length && looksLikeHeader(lines[i])) {
    stripped++
    i++
    if (stripped >= 6) break
    // Also strip immediate blank lines following header blocks.
    while (i < lines.length && lines[i].trim().length === 0) i++
  }

  if (stripped === 0) return { stripped: 0, text: input }

  return { stripped, text: lines.slice(i).join('\n') }
}

