import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { SibilRequest, SibilResponse, SibilStreamChunk, ContentBlock, UsageStats } from '@starships/protocol';
import { env } from '../config/environment';
import { RepositoryFactory } from '@starships/models';
import { VisionRefinementService } from './VisionRefinementService';
import { AffirmationDetector } from './AffirmationDetector';
import { VisionMetricsCalculator } from './VisionMetricsCalculator';
import { VisionRefinementSessionManager, type VisionRefinementSession } from './VisionRefinementSessionManager';

export class SibilService {
  private static openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  private static anthropic = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  // Vision refinement services (lazy initialized)
  private static visionRefinementService: VisionRefinementService | null = null;
  private static affirmationDetector: AffirmationDetector | null = null;
  private static metricsCalculator: VisionMetricsCalculator | null = null;
  private static sessionManager: VisionRefinementSessionManager | null = null;

  private static getVisionRefinementService(): VisionRefinementService {
    if (!this.visionRefinementService) {
      this.visionRefinementService = new VisionRefinementService();
    }
    return this.visionRefinementService;
  }

  private static getAffirmationDetector(): AffirmationDetector {
    if (!this.affirmationDetector) {
      this.affirmationDetector = new AffirmationDetector();
    }
    return this.affirmationDetector;
  }

  private static getMetricsCalculator(): VisionMetricsCalculator {
    if (!this.metricsCalculator) {
      this.metricsCalculator = new VisionMetricsCalculator();
    }
    return this.metricsCalculator;
  }

  private static getSessionManager(): VisionRefinementSessionManager {
    if (!this.sessionManager) {
      this.sessionManager = new VisionRefinementSessionManager();
    }
    return this.sessionManager;
  }

  static async chat(request: SibilRequest): Promise<SibilResponse> {
    const { provider, model, message, starship_id } = request;

    // Get system prompt with starship context
    const systemPrompt = await this.getSibilSystemPromptWithContext(starship_id);

    let content: string;
    let usage: UsageStats | undefined;
    
    if (provider === 'openai') {
      const result = await this.chatWithOpenAI(model || 'gpt-4', message, systemPrompt);
      content = result.content;
      usage = result.usage;
    } else {
      const result = await this.chatWithAnthropic(model || 'claude-3-5-sonnet-20241022', message, systemPrompt);
      content = result.content;
      usage = result.usage;
    }

    // Parse content for structured elements
    const structured_content = this.parseStructuredContent(content);

    return {
      content,
      structured_content,
      provider,
      model: model || (provider === 'openai' ? 'gpt-4' : 'claude-3-5-sonnet-20241022'),
      usage,
    };
  }

  // NEW: Enhanced streaming method with vision refinement
  static async *chatStream(request: SibilRequest): AsyncGenerator<SibilStreamChunk> {
    const { provider, model, message, starship_id, user_id } = request;

    if (!starship_id || !user_id) {
      yield* this.streamNormalChat(request);
      return;
    }

    try {
      // Check if there's an active vision session awaiting confirmation
      const sessionManager = SibilService.getSessionManager();
      const existingSession = sessionManager.getSessionForUser(user_id!);
      const hasActiveVisionSession = existingSession && existingSession.awaitingConfirmation;
      
      // Check if message is vision-related or there's an active session
      const isVisionRelated = SibilService.getVisionRefinementService().isVisionRelated(message);
      
      if (isVisionRelated || hasActiveVisionSession) {
        yield* this.streamVisionRefinement(request);
      } else {
        yield* this.streamNormalChat(request);
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown streaming error',
        is_final: true
      };
    }
  }

  // Vision refinement streaming flow
  private static async *streamVisionRefinement(request: SibilRequest): AsyncGenerator<SibilStreamChunk> {
    const { message, starship_id, user_id } = request;
    
    // Get current vision
    const visionRepo = RepositoryFactory.getVisionRepository();
    const vision = await visionRepo.findByStarship(starship_id!);
    
    if (!vision) {
      yield* this.streamNormalChat(request);
      return;
    }

    // Get or create refinement session
    const session = SibilService.getSessionManager().getOrCreateSession(user_id!, starship_id!, vision.statement);
    console.log('Vision refinement session:', {
      sessionId: session.sessionId,
      awaitingConfirmation: session.awaitingConfirmation,
      hasProposedVision: !!session.proposedVision,
      proposedVision: session.proposedVision
    });
    
    // Add user message to session
    SibilService.getSessionManager().addMessage(session.sessionId, 'user', message, {
      isVisionRelated: true
    });

    // Check if awaiting confirmation for previous proposal
    if (session.awaitingConfirmation) {
      yield* this.handleConfirmationResponse(session, message, request);
      return;
    }

    // Process new vision refinement request
    yield* this.processVisionRefinement(session, message, request);
  }

  // Handle confirmation response (accept/reject/modify)
  private static async *handleConfirmationResponse(
    session: VisionRefinementSession, 
    message: string, 
    request: SibilRequest
  ): AsyncGenerator<SibilStreamChunk> {
    const analysis = SibilService.getAffirmationDetector().analyzeResponse(message);
    
    // Add analysis metadata to session message
    const lastMessageIndex = session.conversationContext.length - 1;
    if (session.conversationContext[lastMessageIndex]) {
      session.conversationContext[lastMessageIndex].metadata = {
        ...session.conversationContext[lastMessageIndex].metadata,
        userIntent: analysis.intent
      };
    }

    switch (analysis.intent) {
      case 'accept':
        yield* this.acceptVisionRefinement(session, request);
        break;
      
      case 'reject':
        yield* this.rejectVisionRefinement(session, analysis.feedback, request);
        break;
      
      case 'modify':
        yield* this.handleModificationRequest(session, analysis.feedback, message, request);
        break;
      
      default:
        yield* this.handleUnclearResponse(session, request);
        break;
    }
  }

  // Accept vision refinement and update database
  private static async *acceptVisionRefinement(
    session: VisionRefinementSession,
    request: SibilRequest
  ): AsyncGenerator<SibilStreamChunk> {
    if (!session.proposedVision) {
      console.error('No proposed vision in session:', session.sessionId);
      yield {
        type: 'error',
        error: 'No vision refinement to accept. Please propose a refinement first.',
        is_final: true
      };
      return;
    }

    try {
      // Save the proposed vision before it gets cleared
      const proposedVisionText = session.proposedVision;
      
      // Update vision in database
      const visionRepo = RepositoryFactory.getVisionRepository();
      
      // First check if vision exists
      const existingVision = await visionRepo.findByStarship(session.starshipId);
      
      let updatedVision;
      if (existingVision) {
        // Update existing vision
        updatedVision = await visionRepo.updateStatement(session.starshipId, proposedVisionText);
      } else {
        // Create new vision if it doesn't exist
        updatedVision = await visionRepo.create({
          starshipId: session.starshipId,
          statement: proposedVisionText,
          refinementCount: 1,
          confidence: 0.8,
          lastRefined: new Date().toISOString(),
          isActive: true
        });
      }
      
      if (!updatedVision) {
        throw new Error('Failed to update or create vision');
      }
      
      // Update session state (this will clear proposedVision)
      SibilService.getSessionManager().acceptProposal(session.sessionId);
      
      // Calculate metrics for the new vision using the saved text
      const metrics = await SibilService.getMetricsCalculator().calculateMetrics(
        proposedVisionText, 
        updatedVision?.refinementCount || 0
      );

      // Stream confirmation response
      const confirmationMessage = "Excellent! I've updated your starship's vision statement. The new vision is now active and will guide all future operations.";
      
      yield* this.streamTextResponse(confirmationMessage, request);
      
      // Add assistant message to session
      SibilService.getSessionManager().addMessage(session.sessionId, 'assistant', confirmationMessage, {
        isVisionRelated: true
      });

    } catch (error) {
      console.error('Vision update error:', error);
      yield {
        type: 'error',
        error: `Failed to update vision statement: ${error instanceof Error ? error.message : 'Unknown error'}`,
        is_final: true
      };
    }
  }

  // Reject vision refinement and ask for feedback
  private static async *rejectVisionRefinement(
    session: VisionRefinementSession,
    feedback: string[],
    request: SibilRequest
  ): AsyncGenerator<SibilStreamChunk> {
    // Update session state
    SibilService.getSessionManager().rejectProposal(session.sessionId, feedback);
    
    let response = "No problem! I understand this refinement doesn't quite capture what you're looking for. ";
    
    if (feedback.length > 0) {
      response += "Based on your feedback, I'll focus on " + this.formatFeedbackAreas(feedback) + ". ";
    }
    
    response += "What specific aspects would you like me to adjust or emphasize?";
    
    yield* this.streamTextResponse(response, request);
    
    // Add assistant message to session
    SibilService.getSessionManager().addMessage(session.sessionId, 'assistant', response);
  }

  // Handle modification requests
  private static async *handleModificationRequest(
    session: VisionRefinementSession,
    feedback: string[],
    message: string,
    request: SibilRequest
  ): AsyncGenerator<SibilStreamChunk> {
    // Update session state
    SibilService.getSessionManager().rejectProposal(session.sessionId, feedback);
    
    // Process the modification request as a new refinement
    yield* this.processVisionRefinement(session, message, request);
  }

  // Handle unclear responses
  private static async *handleUnclearResponse(
    session: VisionRefinementSession,
    request: SibilRequest
  ): AsyncGenerator<SibilStreamChunk> {
    const response = "I want to make sure I understand correctly. Are you happy with this vision refinement, or would you like me to make some adjustments? You can say 'yes' to accept it, or tell me what you'd like me to change.";
    
    yield* this.streamTextResponse(response, request);
    
    // Add assistant message to session
    SibilService.getSessionManager().addMessage(session.sessionId, 'assistant', response);
  }

  // Process vision refinement request
  private static async *processVisionRefinement(
    session: VisionRefinementSession,
    message: string,
    request: SibilRequest
  ): AsyncGenerator<SibilStreamChunk> {
    // Get conversation context
    const conversationHistory = session.conversationContext.slice(-5); // Last 5 messages
    
    // Generate refinement
    const refinement = await SibilService.getVisionRefinementService().refine(
      session.currentVision,
      message,
      conversationHistory
    );
    
    if (refinement.proposedVision) {
      // Set session to awaiting confirmation
      SibilService.getSessionManager().setAwaitingConfirmation(
        session.sessionId, 
        refinement.proposedVision, 
        refinement.confidenceLevel
      );
      
      // Stream the proposed vision
      let response = `Based on our conversation, I'd like to propose this refined vision:\n\n**"${refinement.proposedVision}"**\n\n`;
      response += `**Reasoning:** ${refinement.reasoning}\n\n`;
      response += "How does this refined vision sound to you?";
      
      yield* this.streamTextResponse(response, request);
      
      // Add assistant message to session
      SibilService.getSessionManager().addMessage(session.sessionId, 'assistant', response, {
        isVisionRelated: true,
        proposalIncluded: true
      });
    } else {
      // No refinement needed or couldn't generate one
      let response = `I've analyzed your current vision: "${session.currentVision}"\n\n`;
      response += `**Analysis:** ${refinement.reasoning}\n\n`;
      response += "Your vision is already quite strong! Is there any particular aspect you'd like to enhance or clarify?";
      
      yield* this.streamTextResponse(response, request);
      
      // Add assistant message to session
      SibilService.getSessionManager().addMessage(session.sessionId, 'assistant', response, {
        isVisionRelated: true
      });
    }
  }

  // Stream normal chat (non-vision related)
  private static async *streamNormalChat(request: SibilRequest): AsyncGenerator<SibilStreamChunk> {
    const { provider, model, message, starship_id } = request;

    // Get system prompt with starship context (including vision refinement capabilities)
    const systemPrompt = await this.getSibilSystemPromptWithVisionContext(starship_id);

    try {
      if (provider === 'openai') {
        yield* this.streamWithOpenAI(model || 'gpt-4', message, systemPrompt);
      } else {
        yield* this.streamWithAnthropic(model || 'claude-3-5-sonnet-20241022', message, systemPrompt);
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown streaming error',
        is_final: true
      };
    }
  }

  // Stream a simple text response
  private static async *streamTextResponse(text: string, request: SibilRequest): AsyncGenerator<SibilStreamChunk> {
    const { provider, model } = request;
    const words = text.split(' ');
    let content = '';
    let chunkId = 0;

    // Simulate streaming by sending words progressively
    for (const word of words) {
      content += (content ? ' ' : '') + word;
      chunkId++;

      yield {
        type: 'content',
        content: word + (words.indexOf(word) < words.length - 1 ? ' ' : ''),
        structured_content: [{ type: 'markdown', content }],
        provider,
        model: model || (provider === 'openai' ? 'gpt-4' : 'claude-3-5-sonnet-20241022'),
        chunk_id: chunkId.toString(),
        is_final: false
      };

      // Small delay to simulate natural streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Final chunk
    yield {
      type: 'complete',
      content: text,
      structured_content: [{ type: 'markdown', content: text }],
      provider,
      model: model || (provider === 'openai' ? 'gpt-4' : 'claude-3-5-sonnet-20241022'),
      is_final: true
    };
  }

  // Helper method to format feedback areas
  private static formatFeedbackAreas(feedback: string[]): string {
    const areaMap: { [key: string]: string } = {
      'increase_specificity': 'making it more specific',
      'increase_actionability': 'making it more actionable',
      'reduce_length': 'making it more concise',
      'increase_detail': 'adding more detail',
      'add_timeline': 'including timeline elements',
      'add_metrics': 'adding measurable goals',
      'increase_inspiration': 'making it more inspiring',
      'increase_realism': 'making it more realistic'
    };

    const formattedAreas = feedback
      .map(f => areaMap[f] || f)
      .filter(Boolean);

    if (formattedAreas.length === 0) return 'general improvements';
    if (formattedAreas.length === 1) return formattedAreas[0];
    if (formattedAreas.length === 2) return formattedAreas.join(' and ');
    
    return formattedAreas.slice(0, -1).join(', ') + ', and ' + formattedAreas[formattedAreas.length - 1];
  }

  private static async *streamWithOpenAI(model: string, message: string, systemPrompt: string): AsyncGenerator<SibilStreamChunk> {
    const stream = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    });

    let fullContent = '';
    let chunkId = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        chunkId++;

        // Parse structured content progressively
        const structuredContent = this.parseStructuredContentProgressive(fullContent);

        yield {
          type: 'content',
          content,
          structured_content: structuredContent,
          provider: 'openai',
          model,
          chunk_id: chunkId.toString(),
          is_final: false
        };
      }
    }

    // Final chunk with complete content
    yield {
      type: 'complete',
      content: fullContent,
      structured_content: this.parseStructuredContent(fullContent),
      provider: 'openai',
      model,
      is_final: true
    };
  }

  private static async *streamWithAnthropic(model: string, message: string, systemPrompt: string): AsyncGenerator<SibilStreamChunk> {
    const stream = await this.anthropic.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
      stream: true,
    });

    let fullContent = '';
    let chunkId = 0;

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const content = chunk.delta.text;
        fullContent += content;
        chunkId++;

        const structuredContent = this.parseStructuredContentProgressive(fullContent);

        yield {
          type: 'content',
          content,
          structured_content: structuredContent,
          provider: 'anthropic',
          model,
          chunk_id: chunkId.toString(),
          is_final: false
        };
      }
    }

    // Final chunk
    yield {
      type: 'complete',
      content: fullContent,
      structured_content: this.parseStructuredContent(fullContent),
      provider: 'anthropic',
      model,
      is_final: true
    };
  }

  // NEW: Progressive content parsing for streaming
  private static parseStructuredContentProgressive(content: string): ContentBlock[] {
    // Simplified progressive parsing - detect complete blocks only
    const blocks: ContentBlock[] = [];
    
    // Only parse complete code blocks
    const completeCodeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = completeCodeRegex.exec(content)) !== null) {
      blocks.push({
        type: 'code',
        content: match[2].trim(),
        metadata: {
          language: match[1] || 'text',
        },
      });
    }
    
    // If no complete structured content, treat as markdown
    if (blocks.length === 0) {
      blocks.push({
        type: 'markdown',
        content,
      });
    }
    
    return blocks;
  }

  private static async chatWithOpenAI(model: string, message: string, systemPrompt: string): Promise<{ content: string; usage?: UsageStats }> {
    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
      } : undefined;

      return { content, usage };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async chatWithAnthropic(model: string, message: string, systemPrompt: string): Promise<{ content: string; usage?: UsageStats }> {
    try {
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 4096,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const usage = response.usage ? {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
      } : undefined;

      return { content, usage };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static getSibilSystemPrompt(): string {
    return `You are Sibil, an AI assistant that provides well-structured, helpful responses.

FORMATTING GUIDELINES:
- Use proper markdown formatting for structure and readability
- Use \`\`\`language for code blocks with appropriate language specification
- Use markdown tables for tabular data
- Organize complex responses with clear headers and sections
- Always specify programming language in code blocks for syntax highlighting
- Use bullet points and numbered lists for clarity

Respond naturally while following these formatting conventions to ensure your responses render beautifully.`;
  }

  private static async getSibilSystemPromptWithContext(starshipId?: string): Promise<string> {
    let basePrompt = this.getSibilSystemPrompt();
    
    if (!starshipId) {
      return basePrompt;
    }

    try {
      // Get starship and vision data
      const starshipRepo = RepositoryFactory.getStarshipRepository();
      const visionRepo = RepositoryFactory.getVisionRepository();
      
      const starship = await starshipRepo.findById(starshipId);
      if (!starship) {
        return basePrompt;
      }

      const vision = await visionRepo.findByStarship(starshipId);
      
      // Add starship context to the prompt
      let contextPrompt = basePrompt + `\n\nSTARSHIP CONTEXT:\n`;
      contextPrompt += `- You are assisting the crew of "${starship.name}", a ${starship.class}-class starship.\n`;
      
      if (vision) {
        contextPrompt += `- The starship's vision is: "${vision.statement}"\n`;
        contextPrompt += `- Always keep this vision in mind when providing assistance and suggestions.\n`;
      }
      
      contextPrompt += `- The starship can deploy up to ${starship.maxAgents} agents for various tasks.\n`;
      contextPrompt += `\nUse this context to provide more relevant and personalized assistance to the crew.`;
      
      return contextPrompt;
    } catch (error) {
      console.error('Error loading starship context:', error);
      return basePrompt;
    }
  }

  // Enhanced system prompt that includes vision refinement capabilities
  private static async getSibilSystemPromptWithVisionContext(starshipId?: string): Promise<string> {
    let basePrompt = this.getSibilSystemPrompt();
    
    if (!starshipId) {
      return basePrompt;
    }

    try {
      // Get starship and vision data
      const starshipRepo = RepositoryFactory.getStarshipRepository();
      const visionRepo = RepositoryFactory.getVisionRepository();
      
      const starship = await starshipRepo.findById(starshipId);
      if (!starship) {
        return basePrompt;
      }

      const vision = await visionRepo.findByStarship(starshipId);
      
      // Add starship context to the prompt
      let contextPrompt = basePrompt + `\n\nSTARSHIP CONTEXT:\n`;
      contextPrompt += `- You are assisting the crew of "${starship.name}", a ${starship.class}-class starship.\n`;
      
      if (vision) {
        contextPrompt += `- The starship's vision is: "${vision.statement}"\n`;
        contextPrompt += `- Always keep this vision in mind when providing assistance and suggestions.\n`;
      }
      
      contextPrompt += `- The starship can deploy up to ${starship.maxAgents} agents for various tasks.\n`;

      // Add vision refinement capabilities
      contextPrompt += `\n\nVISION REFINEMENT CAPABILITIES:\n`;
      contextPrompt += `- You can help refine and improve the starship's vision statement through conversation.\n`;
      contextPrompt += `- When users discuss vision, mission, purpose, goals, or long-term direction, offer to help refine their vision.\n`;
      contextPrompt += `- Ask clarifying questions about objectives, success metrics, timeline, and unique value proposition.\n`;
      contextPrompt += `- Suggest improvements that make the vision more specific, actionable, measurable, and inspiring.\n`;
      contextPrompt += `- Always maintain the user's core intent and values when suggesting refinements.\n`;
      contextPrompt += `\nIf you detect vision-related discussion, you can say something like: "I can help refine your starship's vision to make it even more powerful and actionable. Would you like me to suggest some improvements?"\n`;
      
      contextPrompt += `\nUse this context to provide more relevant and personalized assistance to the crew.`;
      
      return contextPrompt;
    } catch (error) {
      console.error('Error loading starship context:', error);
      return basePrompt;
    }
  }

  private static parseStructuredContent(content: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    
    // Extract code blocks
    const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeRegex.exec(content)) !== null) {
      blocks.push({
        type: 'code',
        content: match[2].trim(),
        metadata: {
          language: match[1] || 'text',
        },
      });
    }
    
    // Extract tables
    const tableRegex = /\|(.+)\|\n\|[-\s|]+\|\n((?:\|.+\|\n?)+)/g;
    while ((match = tableRegex.exec(content)) !== null) {
      const headers = match[1].split('|').map(h => h.trim()).filter(Boolean);
      blocks.push({
        type: 'table',
        content: match[0],
        metadata: {
          headers,
        },
      });
    }
    
    // If no structured content found, treat as markdown
    if (blocks.length === 0) {
      blocks.push({
        type: 'markdown',
        content,
      });
    }
    
    return blocks;
  }
}