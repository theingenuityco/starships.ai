import { ExpeditionStatus } from '@starships/protocol';

// Import ExpeditionContext from VirtualFirstOfficer
export interface ExpeditionContext {
  expeditionId: string;
  shipSlug: string;
  status: ExpeditionStatus;
  objectives: string;
  createdAt: string;
  updatedAt?: string;
  participants?: Array<{
    id: string;
    name: string;
    role?: string;
    status?: string;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    assignedTo?: string;
  }>;
  recentMessages?: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
}

export class PromptEngine {
  private systemPrompt = `You are the Virtual First Officer, an intelligent and proactive assistant specializing in expedition management. Your role is to:

1. Provide context-aware guidance based on the current expedition status
2. Help teams navigate challenges and optimize their workflows
3. Offer strategic insights and actionable recommendations
4. Maintain awareness of expedition objectives, participants, and progress
5. Communicate clearly and concisely, focusing on practical solutions

Key behaviors:
- Be proactive in identifying potential issues before they become blockers
- Suggest specific, actionable next steps based on the current context
- Reference relevant expedition details when providing guidance
- Adapt your communication style to the expedition's current phase
- Balance encouragement with realistic assessment of challenges
- Draw from the expedition's history to inform recommendations`;

  private statePrompts: Record<ExpeditionStatus, string> = {
    'draft': `For this DRAFT expedition, focus on:
- Helping refine and clarify objectives
- Suggesting appropriate agents based on the expedition goals
- Identifying potential challenges early
- Recommending task breakdown strategies
- Ensuring objectives are specific, measurable, and achievable`,

    'planning': `For this PLANNING phase expedition, assist with:
- Breaking down objectives into specific, actionable tasks
- Suggesting optimal task assignments based on agent capabilities
- Identifying dependencies between tasks
- Recommending timelines and milestones
- Highlighting potential resource needs or constraints`,

    'in-progress': `For this IN_PROGRESS expedition, provide:
- Real-time progress updates based on completed tasks
- Identification of blockers or delays
- Suggestions for overcoming current challenges
- Coordination advice for multi-agent workflows
- Risk assessment and mitigation strategies`,

    'review': `For this expedition in REVIEW, focus on:
- Summarizing completed work and achievements
- Identifying areas for improvement
- Analyzing task performance and efficiency
- Suggesting documentation needs
- Preparing insights for future expeditions`,

    'completed': `For this COMPLETED expedition, help with:
- Extracting key lessons learned
- Identifying successful patterns to replicate
- Suggesting follow-up expeditions or next steps
- Documenting best practices discovered
- Celebrating achievements and recognizing contributions`,

    'failed': `For this FAILED expedition, provide:
- Root cause analysis of what went wrong
- Identification of specific failure points
- Recovery strategies and alternative approaches
- Lessons learned to prevent future failures
- Suggestions for salvaging partial work or insights`,

    'cancelled': `For this CANCELLED expedition, assist with:
- Documenting the work completed before cancellation
- Identifying reusable components or insights
- Analyzing reasons for cancellation
- Suggesting alternative approaches or expeditions
- Preserving valuable learnings for future use`
  };

  public generatePrompt(
    context: ExpeditionContext,
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): string {
    try {
      // Get the state-specific prompt
      const statePrompt = this.statePrompts[context.status];
      if (!statePrompt) {
        throw new Error(`Unknown expedition status: ${context.status}`);
      }

      // Build context summary
      const contextSummary = this.buildContextSummary(context);

      // Format conversation history
      const historyContext = this.formatConversationHistory(conversationHistory);

      // Construct the complete prompt
      const prompt = `${this.systemPrompt}

Current Expedition Context:
${contextSummary}

${statePrompt}

Conversation History:
${historyContext}

User Message: ${userMessage}

Please provide a helpful, context-aware response that addresses the user's message while considering the expedition's current status and objectives.`;

      return prompt;
    } catch (error) {
      console.error('Error generating prompt:', error);
      throw new Error(`Failed to generate prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildContextSummary(context: ExpeditionContext): string {
    const sections = [
      `Expedition ID: ${context.expeditionId}`,
      `Status: ${context.status}`,
      `Ship: ${context.shipSlug}`,
      `Objectives: ${context.objectives}`,
      `Created: ${new Date(context.createdAt).toLocaleString()}`
    ];

    if (context.participants && context.participants.length > 0) {
      const participantNames = context.participants.map(p => p.name).join(', ');
      sections.push(`Participants: ${participantNames}`);
    }

    if (context.tasks && context.tasks.length > 0) {
      const taskSummary = this.summarizeTasks(context.tasks);
      sections.push(`Tasks: ${taskSummary}`);
    }

    if (context.updatedAt) {
      sections.push(`Last Updated: ${new Date(context.updatedAt).toLocaleString()}`);
    }

    return sections.join('\n');
  }

  private summarizeTasks(tasks: any[]): string {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'in-progress').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const failed = tasks.filter(t => t.status === 'failed').length;

    const parts = [`${total} total`];
    if (completed > 0) parts.push(`${completed} completed`);
    if (inProgress > 0) parts.push(`${inProgress} in progress`);
    if (pending > 0) parts.push(`${pending} pending`);
    if (failed > 0) parts.push(`${failed} failed`);

    return parts.join(', ');
  }

  private formatConversationHistory(
    history: Array<{ role: string; content: string }>
  ): string {
    if (history.length === 0) {
      return 'No previous conversation history.';
    }

    // Limit history to last 10 messages for context window management
    const recentHistory = history.slice(-10);
    
    return recentHistory
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n\n');
  }

  // Additional helper methods for specific state transitions
  public generateStateTransitionPrompt(
    fromStatus: ExpeditionStatus,
    toStatus: ExpeditionStatus,
    context: ExpeditionContext
  ): string {
    const transitionPrompts: Record<string, string> = {
      'draft-planning': 
        'The expedition is moving from draft to planning. Help the team establish clear task assignments and timelines.',
      'planning-in-progress': 
        'The expedition is starting execution. Ensure all participants understand their tasks and dependencies.',
      'in-progress-review': 
        'The expedition is entering review. Help summarize achievements and identify areas for improvement.',
      'review-completed': 
        'The expedition is being marked complete. Document final insights and suggest follow-up actions.',
      'in-progress-failed': 
        'The expedition has encountered critical issues. Focus on understanding what went wrong and recovery options.',
      'in-progress-cancelled': 
        'The expedition is being cancelled. Help preserve valuable work and document reasons for cancellation.'
    };

    const key = `${fromStatus}-${toStatus}`;
    const transitionPrompt = transitionPrompts[key] || 
      `The expedition is transitioning from ${fromStatus} to ${toStatus}. Provide appropriate guidance for this change.`;

    return `${this.systemPrompt}\n\nState Transition: ${transitionPrompt}\n\nExpedition Context:\n${this.buildContextSummary(context)}`;
  }

  // Method to generate focused prompts for specific expedition aspects
  public generateAspectPrompt(
    aspect: 'objectives' | 'participants' | 'tasks' | 'blockers' | 'progress',
    context: ExpeditionContext
  ): string {
    const aspectPrompts: Record<typeof aspect, string> = {
      objectives: 'Focus on helping refine, clarify, or assess the expedition objectives.',
      participants: 'Provide guidance on participant roles, responsibilities, and collaboration.',
      tasks: 'Assist with task management, including creation, assignment, and prioritization.',
      blockers: 'Help identify and resolve blockers preventing expedition progress.',
      progress: 'Analyze current progress and suggest ways to maintain or improve momentum.'
    };

    return `${this.systemPrompt}\n\n${aspectPrompts[aspect]}\n\nExpedition Context:\n${this.buildContextSummary(context)}`;
  }
}