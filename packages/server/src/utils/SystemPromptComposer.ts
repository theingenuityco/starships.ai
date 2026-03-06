export type ThreadContextState = {
  sourceConversationId?: string;
  sourceMessageId?: string;
  sourceRole?: string;
  sourceUserName?: string;
  sourceAgentName?: string;
  sourceCreatedAt?: string;
  sourceAttachmentIds?: string[];
  sourceContent?: string;
  extractedAt?: string;
};

export type CanonicalSystemPromptArgs = {
  personaPrompt?: string;
  starshipContext?: string;
  policyBlocks?: string[];
  threadContext?: ThreadContextState | null;
  history?: { truncated: boolean; historyLimit: number } | null;
};

function safeTrim(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

function truncateText(s: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n\n[truncated: originalLength=${s.length} chars]`;
}

function renderSection(id: string, body: string): string {
  const content = safeTrim(body);
  if (!content) return '';
  return [`<section id="${id}">`, content, `</section>`].join('\n');
}

function renderHistoryPolicy(historyLimit: number): string {
  return (
    `Note: conversation history is truncated in this prompt.\n` +
    `- Only the most recent ${historyLimit} messages are included to avoid overflowing the model context.\n` +
    `- Earlier messages exist but are folded.\n` +
    `To read older messages, use an available history-reading tool (discoverable via your tool list) that accepts an \`offset\` (skip N newest messages) and \`limit\`.\n` +
    `Example: { "offset": ${historyLimit}, "limit": 20 }`
  );
}

/**
 * Build a single canonical system prompt string with deterministic sections.
 *
 * Design goals:
 * - exactly one system message per LLM call (host/provider adapters may still flatten it)
 * - sectioned layout for token budgeting + future caching/partial updates
 */
export function composeCanonicalSystemPrompt(args: CanonicalSystemPromptArgs): string {
  const persona = safeTrim(args.personaPrompt);
  const world = safeTrim(args.starshipContext);
  const policy = (Array.isArray(args.policyBlocks) ? args.policyBlocks : []).map((x) => safeTrim(x)).filter(Boolean).join('\n\n');

  // Soft budgets (chars). These are conservative and can be tuned per model later.
  const personaBudget = 80_000;
  const worldBudget = 40_000;
  const policyBudget = 25_000;
  const historyBudget = 5_000;

  const sections: string[] = [];
  sections.push(renderSection('policy', truncateText(policy, policyBudget)));
  sections.push(renderSection('persona', truncateText(persona, personaBudget)));
  sections.push(renderSection('world', truncateText(world, worldBudget)));

  if (args.threadContext && typeof args.threadContext === 'object') {
    // Thread context is intentionally not injected into the system prompt. Thread links are
    // navigational UI affordances only; the assistant should rely on the explicit transcript
    // (and user-provided content) rather than implicit parent-message context.
  }

  if (args.history?.truncated) {
    const hp = renderHistoryPolicy(Math.max(1, Math.floor(args.history.historyLimit || 0)));
    sections.push(renderSection('history_policy', truncateText(hp, historyBudget)));
  }

  const body = sections.filter(Boolean).join('\n\n');
  return ['<starships_system_prompt>', body, '</starships_system_prompt>'].filter(Boolean).join('\n');
}

