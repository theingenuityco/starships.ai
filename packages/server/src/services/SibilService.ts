import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { ChatRequest, ChatResponse, ChatStreamChunk, ContentBlock, UsageStats, ChatSession, ChatMessage } from '@starships/protocol';
import { env } from '../config/environment';
import { RepositoryFactory } from '@starships/models';
import { VisionRefinementService } from './VisionRefinementService';
import { AffirmationDetector } from './AffirmationDetector';
import { VisionMetricsCalculator } from './VisionMetricsCalculator';

// Vision refinement session interface for compatibility
interface VisionRefinementState {
  sessionId: string;
  starshipId: string;
  userId: string;
  currentVision: string;
  proposedVision?: string;
  awaitingConfirmation: boolean;
  confidenceLevel: number;
  refinementCount: number;
  conversationContext: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    metadata?: any;
  }>;
}

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
  
  // In-memory state for vision refinement sessions (temporary during migration)
  private static visionRefinementStates: Map<string, VisionRefinementState> = new Map();

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

  // Helper methods for chat session management
  private static async getOrCreateChatSession(userId: string, starshipId: string): Promise<ChatSession> {
    const chatSessionRepo = RepositoryFactory.getChatSessionRepository();
    
    // Try to find active session for this user and starship
    const activeSessions = await chatSessionRepo.findByUser(userId, 10);
    const existingSession = activeSessions.find((session: ChatSession) => 
      session.starship_id === starshipId && 
      session.source === 'sibil' &&
      this.isSessionActive(session)
    );
    
    if (existingSession) {
      // Update activity
      await chatSessionRepo.updateActivity(existingSession.id);
      return existingSession;
    }
    
    // Create new session
    return await chatSessionRepo.create({
      source: 'sibil',
      created_by: userId,
      starship_id: starshipId
    });
  }
  
  private static isSessionActive(session: ChatSession): boolean {
    const lastActivity = new Date(session.last_activity_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    return diffMinutes < 30; // 30 minute timeout
  }
  
  private static async storeMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: any): Promise<void> {
    const chatMessageRepo = RepositoryFactory.getChatMessageRepository();
    await chatMessageRepo.create({
      session_id: sessionId,
      role,
      content,
      structured_content: metadata?.structured_content,
      provider: metadata?.provider,
      model: metadata?.model,
      usage: metadata?.usage
    });
  }
  
  private static async getConversationHistory(sessionId: string, limit: number = 10): Promise<ChatMessage[]> {
    const chatMessageRepo = RepositoryFactory.getChatMessageRepository();
    return await chatMessageRepo.getRecentMessages(sessionId, limit);
  }
  
  private static async getOrCreateVisionRefinementState(userId: string, starshipId: string, currentVision: string, chatSession: ChatSession): Promise<VisionRefinementState> {
    const sessionKey = `${userId}_${starshipId}`;
    let state = this.visionRefinementStates.get(sessionKey);
    
    if (!state) {
      // Get conversation history to build context
      const messages = await this.getConversationHistory(chatSession.id, 10);
      const conversationContext = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.timestamp).getTime(),
        metadata: msg.structured_content ? { structured_content: msg.structured_content } : undefined
      }));
      
      state = {
        sessionId: chatSession.id,
        starshipId,
        userId,
        currentVision,
        awaitingConfirmation: false,
        confidenceLevel: 0.5,
        refinementCount: 0,
        conversationContext
      };
      
      this.visionRefinementStates.set(sessionKey, state);
    }
    
    return state;
  }
  
  private static getVisionRefinementState(userId: string, starshipId: string): VisionRefinementState | null {
    const sessionKey = `${userId}_${starshipId}`;
    return this.visionRefinementStates.get(sessionKey) || null;
  }
  
  private static updateVisionRefinementState(userId: string, starshipId: string, updates: Partial<VisionRefinementState>): void {
    const sessionKey = `${userId}_${starshipId}`;
    const state = this.visionRefinementStates.get(sessionKey);
    if (state) {
      Object.assign(state, updates);
    }
  }

  static async chat(request: ChatRequest): Promise<ChatResponse> {
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
      source: 'sibil',
      content,
      structured_content,
      provider,
      model: model || (provider === 'openai' ? 'gpt-4' : 'claude-3-5-sonnet-20241022'),
      usage,
    };
  }

  // NEW: Enhanced streaming method with vision refinement
  static async *chatStream(request: ChatRequest): AsyncGenerator<ChatStreamChunk> {
    const { message, starship_id, user_id } = request;

    if (!starship_id || !user_id) {
      yield* this.streamNormalChat(request);
      return;
    }

    try {
      // Get or create chat session
      const chatSession = await this.getOrCreateChatSession(user_id!, starship_id!);
      
      // Check if there's an active vision refinement state
      const visionState = this.getVisionRefinementState(user_id!, starship_id!);
      const hasActiveVisionSession = visionState && visionState.awaitingConfirmation;
      
      // Check if message is vision-related or there's an active session
      const isVisionRelated = this.getVisionRefinementService().isVisionRelated(message);
      
      if (isVisionRelated || hasActiveVisionSession) {
        yield* this.streamVisionRefinement(request, chatSession);
      } else {
        yield* this.streamNormalChat(request);
      }
    } catch (error) {
      yield {
        source: 'sibil',
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown streaming error',
        is_final: true
      };
    }
  }

  // Vision refinement streaming flow
  private static async *streamVisionRefinement(request: ChatRequest, chatSession: ChatSession): AsyncGenerator<ChatStreamChunk> {
    const { message, starship_id, user_id } = request;
    
    // Get current vision
    const visionRepo = RepositoryFactory.getVisionRepository();
    const vision = await visionRepo.findByStarship(starship_id!);
    
    if (!vision) {
      yield* this.streamNormalChat(request);
      return;
    }

    // Get or create vision refinement state
    const visionState = await this.getOrCreateVisionRefinementState(user_id!, starship_id!, vision.statement, chatSession);
    console.log('Vision refinement session:', {
      sessionId: visionState.sessionId,
      awaitingConfirmation: visionState.awaitingConfirmation,
      hasProposedVision: !!visionState.proposedVision,
      proposedVision: visionState.proposedVision
    });
    
    // Store user message
    await this.storeMessage(chatSession.id, 'user', message, {
      isVisionRelated: true
    });

    // Check if awaiting confirmation for previous proposal
    if (visionState.awaitingConfirmation) {
      yield* this.handleConfirmationResponse(visionState, message, request, chatSession);
      return;
    }

    // Process new vision refinement request
    yield* this.processVisionRefinement(visionState, message, request, chatSession);
  }

  // Handle confirmation response (accept/reject/modify)
  private static async *handleConfirmationResponse(
    state: VisionRefinementState, 
    message: string, 
    request: ChatRequest,
    chatSession: ChatSession
  ): AsyncGenerator<ChatStreamChunk> {
    const analysis = this.getAffirmationDetector().analyzeResponse(message);
    
    // Add to conversation context
    state.conversationContext.push({
      role: 'user',
      content: message,
      timestamp: Date.now(),
      metadata: { userIntent: analysis.intent }
    });

    switch (analysis.intent) {
      case 'accept':
        yield* this.acceptVisionRefinement(state, request, chatSession);
        break;
      
      case 'reject':
        yield* this.rejectVisionRefinement(state, analysis.feedback, request, chatSession);
        break;
      
      case 'modify':
        yield* this.handleModificationRequest(state, analysis.feedback, message, request, chatSession);
        break;
      
      default:
        yield* this.handleUnclearResponse(state, request, chatSession);
        break;
    }
  }

  // Accept vision refinement and update database
  private static async *acceptVisionRefinement(
    state: VisionRefinementState,
    request: ChatRequest,
    chatSession: ChatSession
  ): AsyncGenerator<ChatStreamChunk> {
    if (!state.proposedVision) {
      console.error('No proposed vision in session:', state.sessionId);
      yield {
        source: 'sibil',
        type: 'error',
        error: 'No vision refinement to accept. Please propose a refinement first.',
        is_final: true
      };
      return;
    }

    try {
      // Save the proposed vision before it gets cleared
      const proposedVisionText = state.proposedVision;
      
      // Update vision in database
      const visionRepo = RepositoryFactory.getVisionRepository();
      
      // First check if vision exists
      const existingVision = await visionRepo.findByStarship(state.starshipId);
      
      let updatedVision;
      if (existingVision) {
        // Update existing vision
        updatedVision = await visionRepo.updateStatement(state.starshipId, proposedVisionText);
      } else {
        // Create new vision if it doesn't exist
        updatedVision = await visionRepo.create({
          starshipId: state.starshipId,
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
      
      // Update state
      this.updateVisionRefinementState(state.userId, state.starshipId, {
        awaitingConfirmation: false,
        proposedVision: undefined,
        refinementCount: state.refinementCount + 1
      });
      
      // Calculate metrics for the new vision using the saved text
      await this.getMetricsCalculator().calculateMetrics(
        proposedVisionText,
        updatedVision?.refinementCount || 0
      );

      // Stream confirmation response
      const confirmationMessage = "Excellent! I've updated your starship's vision statement. The new vision is now active and will guide all future operations.";
      
      yield* this.streamTextResponse(confirmationMessage, request);
      
      // Store assistant message
      await this.storeMessage(chatSession.id, 'assistant', confirmationMessage, {
        isVisionRelated: true
      });

    } catch (error) {
      console.error('Vision update error:', error);
      yield {
        source: 'sibil',
        type: 'error',
        error: `Failed to update vision statement: ${error instanceof Error ? error.message : 'Unknown error'}`,
        is_final: true
      };
    }
  }

  // Reject vision refinement and ask for feedback
  private static async *rejectVisionRefinement(
    state: VisionRefinementState,
    feedback: string[],
    request: ChatRequest,
    chatSession: ChatSession
  ): AsyncGenerator<ChatStreamChunk> {
    // Update state
    this.updateVisionRefinementState(state.userId, state.starshipId, {
      awaitingConfirmation: false,
      proposedVision: undefined
    });
    
    let response = "No problem! I understand this refinement doesn't quite capture what you're looking for. ";
    
    if (feedback.length > 0) {
      response += "Based on your feedback, I'll focus on " + this.formatFeedbackAreas(feedback) + ". ";
    }
    
    response += "What specific aspects would you like me to adjust or emphasize?";
    
    yield* this.streamTextResponse(response, request);
    
    // Store assistant message
    await this.storeMessage(chatSession.id, 'assistant', response);
  }

  // Handle modification requests
  private static async *handleModificationRequest(
    state: VisionRefinementState,
    feedback: string[],
    message: string,
    request: ChatRequest,
    chatSession: ChatSession
  ): AsyncGenerator<ChatStreamChunk> {
    // Update state
    this.updateVisionRefinementState(state.userId, state.starshipId, {
      awaitingConfirmation: false,
      proposedVision: undefined
    });
    
    // Process the modification request as a new refinement
    yield* this.processVisionRefinement(state, message, request, chatSession);
  }

  // Handle unclear responses
  private static async *handleUnclearResponse(
    state: VisionRefinementState,
    request: ChatRequest,
    chatSession: ChatSession
  ): AsyncGenerator<ChatStreamChunk> {
    const response = "I want to make sure I understand correctly. Are you happy with this vision refinement, or would you like me to make some adjustments? You can say 'yes' to accept it, or tell me what you'd like me to change.";
    
    yield* this.streamTextResponse(response, request);
    
    // Store assistant message
    await this.storeMessage(chatSession.id, 'assistant', response);
  }

  // Process vision refinement request
  private static async *processVisionRefinement(
    state: VisionRefinementState,
    message: string,
    request: ChatRequest,
    chatSession: ChatSession
  ): AsyncGenerator<ChatStreamChunk> {
    // Get conversation context (last 5 messages)
    const conversationHistory = state.conversationContext.slice(-5);
    
    // Generate refinement
    const refinement = await this.getVisionRefinementService().refine(
      state.currentVision,
      message,
      conversationHistory
    );
    
    if (refinement.proposedVision) {
      // Update state to awaiting confirmation
      this.updateVisionRefinementState(state.userId, state.starshipId, {
        proposedVision: refinement.proposedVision,
        awaitingConfirmation: true,
        confidenceLevel: refinement.confidenceLevel
      });
      
      // Stream the proposed vision
      let response = `Based on our conversation, I'd like to propose this refined vision:\n\n**"${refinement.proposedVision}"**\n\n`;
      response += `**Reasoning:** ${refinement.reasoning}\n\n`;
      response += "How does this refined vision sound to you?";
      
      yield* this.streamTextResponse(response, request);
      
      // Store assistant message
      await this.storeMessage(chatSession.id, 'assistant', response, {
        isVisionRelated: true,
        proposalIncluded: true
      });
    } else {
      // No refinement needed or couldn't generate one
      let response = `I've analyzed your current vision: "${state.currentVision}"\n\n`;
      response += `**Analysis:** ${refinement.reasoning}\n\n`;
      response += "Your vision is already quite strong! Is there any particular aspect you'd like to enhance or clarify?";
      
      yield* this.streamTextResponse(response, request);
      
      // Store assistant message
      await this.storeMessage(chatSession.id, 'assistant', response, {
        isVisionRelated: true
      });
    }
  }

  // Stream normal chat (non-vision related)
  private static async *streamNormalChat(request: ChatRequest): AsyncGenerator<ChatStreamChunk> {
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
        source: 'sibil',
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown streaming error',
        is_final: true
      };
    }
  }

  // Stream a simple text response
  private static async *streamTextResponse(text: string, request: ChatRequest): AsyncGenerator<ChatStreamChunk> {
    const { provider, model } = request;
    const words = text.split(' ');
    let content = '';
    let chunkId = 0;

    // Simulate streaming by sending words progressively
    for (const word of words) {
      content += (content ? ' ' : '') + word;
      chunkId++;

      yield {
        source: 'sibil',
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
      source: 'sibil',
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

  private static async *streamWithOpenAI(model: string, message: string, systemPrompt: string): AsyncGenerator<ChatStreamChunk> {
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
          source: 'sibil',
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
      source: 'sibil',
      type: 'complete',
      content: fullContent,
      structured_content: this.parseStructuredContent(fullContent),
      provider: 'openai',
      model,
      is_final: true
    };
  }

  private static async *streamWithAnthropic(model: string, message: string, systemPrompt: string): AsyncGenerator<ChatStreamChunk> {
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
          source: 'sibil',
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
      source: 'sibil',
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
    const basePrompt = this.getSibilSystemPrompt();
    
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
    const basePrompt = this.getSibilSystemPrompt();
    
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