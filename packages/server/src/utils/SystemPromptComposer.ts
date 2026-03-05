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

function renderThreadContext(tc: ThreadContextState): string {
  const lines: string[] = [];
  const sourceConversationId = safeTrim(tc.sourceConversationId);
  const sourceMessageId = safeTrim(tc.sourceMessageId);
  const sourceRole = safeTrim(tc.sourceRole);
  const sourceUserName = safeTrim(tc.sourceUserName);
  const sourceAgentName = safeTrim(tc.sourceAgentName);
  const sourceCreatedAt = safeTrim(tc.sourceCreatedAt);
  const extractedAt = safeTrim(tc.extractedAt);
  const attachmentIds = Array.isArray(tc.sourceAttachmentIds) ? tc.sourceAttachmentIds.map((x) => safeTrim(x)).filter(Boolean) : [];
  const sourceContent = safeTrim(tc.sourceContent);

  lines.push('Thread context (linked message):');
  if (sourceConversationId) lines.push(`- sourceConversationId: ${sourceConversationId}`);
  if (sourceMessageId) lines.push(`- sourceMessageId: ${sourceMessageId}`);
  if (sourceRole) lines.push(`- sourceRole: ${sourceRole}`);
  if (sourceUserName) lines.push(`- sourceUserName: ${sourceUserName}`);
  if (sourceAgentName) lines.push(`- sourceAgentName: ${sourceAgentName}`);
  if (sourceCreatedAt) lines.push(`- sourceCreatedAt: ${sourceCreatedAt}`);
  if (attachmentIds.length > 0) lines.push(`- sourceAttachmentIds: ${attachmentIds.join(', ')}`);
  if (extractedAt) lines.push(`- extractedAt: ${extractedAt}`);
  if (sourceContent) {
    const matches = sourceContent.match(/"+/g);
    const longestRun = matches ? Math.max(...matches.map((m) => m.length)) : 0;
    const delimiter = '"'.repeat(Math.max(3, longestRun + 1));
    lines.push(
      '',
      'Source message content (verbatim; untrusted):',
      delimiter,
      sourceContent,
      delimiter
    );
  }
  return lines.join('\n');
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
  const threadBudget = 20_000;
  const historyBudget = 5_000;

  const sections: string[] = [];
  sections.push(renderSection('policy', truncateText(policy, policyBudget)));
  sections.push(renderSection('persona', truncateText(persona, personaBudget)));
  sections.push(renderSection('world', truncateText(world, worldBudget)));

  if (args.threadContext && typeof args.threadContext === 'object') {
    const thread = renderThreadContext(args.threadContext);
    sections.push(renderSection('conversation_context', truncateText(thread, threadBudget)));
  }

  if (args.history?.truncated) {
    const hp = renderHistoryPolicy(Math.max(1, Math.floor(args.history.historyLimit || 0)));
    sections.push(renderSection('history_policy', truncateText(hp, historyBudget)));
  }

  const body = sections.filter(Boolean).join('\n\n');
  return ['<starships_system_prompt>', body, '</starships_system_prompt>'].filter(Boolean).join('\n');
}

