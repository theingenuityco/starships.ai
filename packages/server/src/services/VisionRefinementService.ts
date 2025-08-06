import { RepositoryFactory } from '@starships/models';
import type { VisionRepository } from '@starships/models';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/environment';

// Simple rate limiter class
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number = 10;
  private windowMs: number = 60000; // 1 minute

  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }

  clear(): void {
    this.requests.clear();
  }
}

// Simple circuit breaker class
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures: number = 0;
  private maxFailures: number = 5;
  private timeout: number = 30000; // 30 seconds
  private nextAttempt: number = 0;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is open');
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.maxFailures) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.nextAttempt = 0;
  }
}

// Simple memoizer class
class Memoizer {
  private cache: Map<string, { value: any; timestamp: number }> = new Map();
  private ttl: number = 300000; // 5 minutes

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry.value;
    }
    if (entry) {
      this.cache.delete(key);
    }
    return null;
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clearAll(): void {
    this.cache.clear();
  }

  cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp >= this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  getStats(): { size: number; expired: number; memory: number } {
    const now = Date.now();
    let expired = 0;
    for (const [, entry] of this.cache) {
      if (now - entry.timestamp >= this.ttl) {
        expired++;
      }
    }
    return {
      size: this.cache.size,
      expired,
      memory: this.cache.size * 1000 // rough estimate
    };
  }
}

export interface VisionAnalysis {
  currentVision: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  clarityScore: number;      // 0-100
  specificityScore: number;  // 0-100
  actionabilityScore: number; // 0-100
  inspirationalScore: number; // 0-100
  overallConfidence: number;  // 0-1
  metrics: {
    clarityScore: number;
    specificityScore: number;
    actionabilityScore: number;
    inspirationalScore: number;
    hasObjectives: boolean;
    hasTimeframe: boolean;
    hasMeasurables: boolean;
    overallQuality: number;
    confidence: number;
    refinementCount: number;
  };
}

export interface RefinementContext {
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
  currentVision: string;
  refinementIteration: number;
  userFeedback: string[];
  lastProposedVision?: string;
  awaitingConfirmation: boolean;
}

export interface VisionRefinementResponse {
  proposedVision?: string;
  analysis: VisionAnalysis;
  reasoning: string;
  requiresConfirmation: boolean;
  confidenceLevel: number; // 0-1
}

/**
 * VisionRefinementService handles vision analysis and refinement logic
 * 
 * This service provides the core functionality for analyzing vision statements,
 * generating refinement suggestions, and detecting vision-related conversations.
 */
export class VisionRefinementService {
  private visionRepo: VisionRepository | null = null;
  private openai: OpenAI;
  private anthropic: Anthropic;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private memoizer: Memoizer;
  private debouncedAnalyze: (vision: string) => Promise<VisionAnalysis>;

  // Static cache for analysis results
  private static analysisCache = new Map<string, { analysis: VisionAnalysis; timestamp: number }>();
  private static CACHE_TTL = 300000; // 5 minutes

  // Vision-related keywords for context detection
  private static readonly VISION_KEYWORDS = [
    'vision', 'mission', 'purpose', 'goals', 'objectives', 'refine', 'improve',
    'direction', 'strategy', 'long-term', 'future', 'aspiration', 'ambition',
    'target', 'aim', 'intention', 'dream', 'hope', 'destination', 'end goal'
  ];

  // Contextual phrases that might indicate vision discussion
  private static readonly VISION_CONTEXTS = [
    /what.*(?:trying to|want to|hoping to|planning to|aiming to)/i,
    /where.*(?:heading|going|want.*to be)/i,
    /(?:long.?term|future).*(?:plan|goal|vision|direction)/i,
    /(?:main|core|primary).*(?:purpose|goal|objective)/i,
    /what.*(?:success|achievement).*look like/i,
    /(?:refine|improve|enhance|clarify).*vision/i
  ];

  constructor() {
    // Delay repository initialization to avoid early access
    // this.visionRepo will be lazily initialized on first use
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    this.rateLimiter = new RateLimiter();
    this.circuitBreaker = new CircuitBreaker();
    this.memoizer = new Memoizer();
    this.debouncedAnalyze = this.createDebouncedAnalyze();
  }

  private getVisionRepo(): VisionRepository {
    if (!this.visionRepo) {
      this.visionRepo = RepositoryFactory.getVisionRepository();
    }
    return this.visionRepo;
  }

  /**
   * Creates a debounced version of the analyze function
   */
  private createDebouncedAnalyze(): (vision: string) => Promise<VisionAnalysis> {
    const debounceMap = new Map<string, { timer: NodeJS.Timeout; promise: Promise<VisionAnalysis>; resolve: (value: VisionAnalysis) => void; reject: (error: any) => void }>();
    
    return (vision: string): Promise<VisionAnalysis> => {
      const key = this.hashString(vision);
      
      // If there's already a pending analysis for this vision, return the existing promise
      if (debounceMap.has(key)) {
        return debounceMap.get(key)!.promise;
      }
      
      let resolvePromise: (value: VisionAnalysis) => void;
      let rejectPromise: (error: any) => void;
      
      const promise = new Promise<VisionAnalysis>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      
      const timer = setTimeout(async () => {
        try {
          const result = await this.performAnalysis(vision);
          this.setCachedAnalysis(vision, result);
          resolvePromise(result);
        } catch (error) {
          rejectPromise(error);
        } finally {
          debounceMap.delete(key);
        }
      }, 500); // 500ms debounce
      
      debounceMap.set(key, { timer, promise, resolve: resolvePromise!, reject: rejectPromise! });
      
      return promise;
    };
  }

  /**
   * Detects if a message is vision-related based on keywords and context
   * @param message - The message to analyze
   * @returns boolean indicating if message is vision-related
   * @throws {Error} If message is null or undefined
   */
  isVisionRelated(message: string): boolean {
    if (message === null || message === undefined) {
      throw new Error('Message cannot be null or undefined');
    }
    
    if (typeof message !== 'string') {
      throw new Error('Message must be a string');
    }
    
    if (message.trim().length === 0) {
      return false;
    }
    
    try {
      const lowerMessage = message.toLowerCase();
      
      // Check for direct keyword matches
      const hasVisionKeywords = VisionRefinementService.VISION_KEYWORDS.some(keyword => 
        lowerMessage.includes(keyword)
      );

      // Check for contextual patterns
      const hasVisionContext = VisionRefinementService.VISION_CONTEXTS.some(pattern =>
        pattern.test(message)
      );

      // Don't trigger refinement for simple queries like "what is my vision?"
      const simpleQueries = [
        /^what('s| is) (my |our |the )?(current )?vision\??$/i,
        /^show (me )?(my |our |the )?vision$/i,
        /^tell me (my |our |the )?vision$/i,
        /^(my |our )?vision\?$/i
      ];
      
      if (simpleQueries.some(pattern => pattern.test(message.trim()))) {
        return false;
      }
      
      // Only trigger if there's clear refinement intent
      const refinementKeywords = ['refine', 'improve', 'enhance', 'update', 'change', 'modify', 'revise', 'help', 'better', 'clearer'];
      const hasRefinementIntent = refinementKeywords.some(keyword => lowerMessage.includes(keyword) && lowerMessage.includes('vision'));
      
      // Or if there are vision keywords with contextual patterns
      return hasRefinementIntent || (hasVisionKeywords && hasVisionContext);
    } catch (error) {
      console.error('Error in vision detection:', error);
      return false;
    }
  }

  /**
   * Public analyze method with performance optimizations
   * @param vision - The vision statement to analyze
   * @param useCache - Whether to use cached results (default: true)
   * @returns Promise<VisionAnalysis> containing detailed analysis metrics
   * @throws {Error} If vision is invalid or analysis fails
   */
  async analyze(vision: string, useCache: boolean = true): Promise<VisionAnalysis> {
    if (!vision || typeof vision !== 'string') {
      throw new Error('Vision statement must be a non-empty string');
    }
    
    const trimmedVision = vision.trim();
    if (trimmedVision.length === 0) {
      throw new Error('Vision statement cannot be empty');
    }
    
    if (trimmedVision.length > 5000) {
      throw new Error('Vision statement is too long (maximum 5000 characters)');
    }
    
    // Check cache first if enabled
    if (useCache) {
      const cached = this.getCachedAnalysis(trimmedVision);
      if (cached) {
        return cached;
      }
    }
    
    // Use circuit breaker and debounced analysis for rapid consecutive calls
    return this.circuitBreaker.execute(async () => {
      return this.debouncedAnalyze(trimmedVision);
    });
  }
  
  /**
   * Internal analysis method that performs the actual work
   */
  private async performAnalysis(vision: string): Promise<VisionAnalysis> {
    // Rate limiting check
    const rateLimitKey = `analysis:${this.hashString(vision)}`;
    if (!this.rateLimiter.isAllowed(rateLimitKey)) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    try {
      const prompt = `Analyze this vision statement and provide a detailed assessment:

Vision: "${vision}"

Please analyze the vision across these dimensions and provide scores (0-100) and explanations:

1. CLARITY: How clear and easy to understand is the vision?
2. SPECIFICITY: How specific and detailed are the goals?
3. ACTIONABILITY: How actionable and implementable is the vision?
4. INSPIRATION: How motivating and inspiring is the vision?

For each dimension, provide:
- A score (0-100)
- 2-3 specific strengths 
- 2-3 specific weaknesses or areas for improvement
- 2-3 concrete suggestions for enhancement

Format your response as JSON:
{
  "clarityScore": number,
  "specificityScore": number,
  "actionabilityScore": number,
  "inspirationalScore": number,
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "suggestions": ["suggestion 1", "suggestion 2", ...]
}`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const analysisData = JSON.parse(content);

      const clarityScore = analysisData.clarityScore || 50;
      const specificityScore = analysisData.specificityScore || 50;
      const actionabilityScore = analysisData.actionabilityScore || 50;
      const inspirationalScore = analysisData.inspirationalScore || 50;
      const overallConfidence = this.calculateOverallConfidence(analysisData);
      
      const analysis: VisionAnalysis = {
        currentVision: vision,
        clarityScore,
        specificityScore,
        actionabilityScore,
        inspirationalScore,
        strengths: analysisData.strengths || [],
        weaknesses: analysisData.weaknesses || [],
        suggestions: analysisData.suggestions || [],
        overallConfidence,
        metrics: {
          clarityScore,
          specificityScore,
          actionabilityScore,
          inspirationalScore,
          hasObjectives: vision.toLowerCase().includes('objective') || vision.toLowerCase().includes('goal'),
          hasTimeframe: /\b(by|within|until|before)\s+\d{4}|\b(month|year|week|day)s?\b/i.test(vision),
          hasMeasurables: /\b(\d+%?|\$[\d,]+|increase|decrease|improve|reduce)\b/i.test(vision),
          overallQuality: (clarityScore + specificityScore + actionabilityScore + inspirationalScore) / 4,
          confidence: overallConfidence,
          refinementCount: 0
        }
      };

      return analysis;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Vision analysis error:', {
        error: errorMessage,
        vision: vision.substring(0, 100) + '...',
        timestamp: new Date().toISOString()
      });
      
      // For API rate limit errors, throw immediately
      if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }
      
      // For authentication errors, throw immediately
      if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
        throw new Error('API authentication failed. Please check configuration.');
      }
      
      // Return fallback analysis for other errors
      return this.createFallbackAnalysis(vision);
    }
  }

  /**
   * Refines a vision statement based on conversation context and user input
   * @param currentVision - The current vision statement
   * @param userMessage - The user's refinement request
   * @param conversationContext - Previous conversation messages
   * @returns Promise<VisionRefinementResponse> containing refinement proposal
   * @throws {Error} If inputs are invalid or refinement fails
   */
  async refine(
    currentVision: string,
    userMessage: string,
    conversationContext: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>
  ): Promise<VisionRefinementResponse> {
    // Input validation
    if (!currentVision || typeof currentVision !== 'string' || currentVision.trim().length === 0) {
      throw new Error('Current vision must be a non-empty string');
    }
    
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      throw new Error('User message must be a non-empty string');
    }
    
    if (!Array.isArray(conversationContext)) {
      throw new Error('Conversation context must be an array');
    }
    
    if (currentVision.length > 5000) {
      throw new Error('Vision statement is too long (maximum 5000 characters)');
    }
    
    if (userMessage.length > 1000) {
      throw new Error('User message is too long (maximum 1000 characters)');
    }
    
    // Validate conversation context entries
    for (const entry of conversationContext) {
      if (!entry.role || !['user', 'assistant'].includes(entry.role)) {
        throw new Error('Invalid conversation context: role must be "user" or "assistant"');
      }
      if (!entry.content || typeof entry.content !== 'string') {
        throw new Error('Invalid conversation context: content must be a non-empty string');
      }
      if (!entry.timestamp || typeof entry.timestamp !== 'number') {
        throw new Error('Invalid conversation context: timestamp must be a number');
      }
    }
    try {
      const contextMessages = conversationContext.slice(-5); // Use last 5 messages for context
      const contextString = contextMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const prompt = `You are helping refine a vision statement. 

Current Vision: "${currentVision}"

Recent conversation context:
${contextString}

User's latest input: "${userMessage}"

Based on the conversation and user input, please:

1. Analyze what the user is asking for regarding their vision
2. Propose a refined version that addresses their concerns
3. Explain your reasoning for the changes
4. Assess confidence in the refinement (0-1)

CRITICAL GUIDELINES:
- The user's current vision is exactly as stated above - DO NOT assume or invent a different vision
- ONLY refine based on what the user explicitly asks for
- PRESERVE the core intent - if they want to build a building, keep it about buildings
- Do not change the fundamental nature of the vision unless explicitly requested
- If the user is just asking what their vision is, indicate no refinement is needed
- Make the vision more specific, actionable, and inspiring while staying true to the original
- Keep it concise but meaningful (ideally 1-3 sentences)

Respond in JSON format:
{
  "needsRefinement": boolean,
  "proposedVision": "refined vision text or null if no refinement needed",
  "reasoning": "explanation of changes made",
  "confidenceLevel": 0.8,
  "keyChanges": ["change 1", "change 2", ...]
}`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.4,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const refinementData = JSON.parse(content);

      // Get analysis of the proposed vision
      const proposedVision = refinementData.proposedVision;
      const analysis = proposedVision 
        ? await this.analyze(proposedVision)
        : await this.analyze(currentVision);

      return {
        proposedVision: refinementData.needsRefinement ? proposedVision : undefined,
        analysis,
        reasoning: refinementData.reasoning || 'No specific reasoning provided',
        requiresConfirmation: refinementData.needsRefinement,
        confidenceLevel: refinementData.confidenceLevel || 0.7
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Vision refinement error:', {
        error: errorMessage,
        currentVision: currentVision.substring(0, 100) + '...',
        userMessage: userMessage.substring(0, 100) + '...',
        timestamp: new Date().toISOString()
      });
      
      // For validation errors, throw immediately
      if (errorMessage.includes('must be') || errorMessage.includes('too long') || errorMessage.includes('Invalid')) {
        throw error;
      }
      
      // For API rate limit errors, throw immediately
      if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }
      
      // For authentication errors, throw immediately
      if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
        throw new Error('API authentication failed. Please check configuration.');
      }
      
      // Return fallback response for other errors
      return this.createFallbackRefinement(currentVision);
    }
  }

  /**
   * Creates a natural language summary of vision improvements
   * @param originalVision - The original vision statement
   * @param refinedVision - The refined vision statement
   * @param analysis - The analysis results
   * @returns Promise<string> containing improvement summary
   * @throws {Error} If inputs are invalid
   */
  async generateImprovementSummary(
    originalVision: string,
    refinedVision: string,
    analysis: VisionAnalysis
  ): Promise<string> {
    if (!originalVision || typeof originalVision !== 'string') {
      throw new Error('Original vision must be a non-empty string');
    }
    
    if (!refinedVision || typeof refinedVision !== 'string') {
      throw new Error('Refined vision must be a non-empty string');
    }
    
    if (!analysis || typeof analysis !== 'object') {
      throw new Error('Analysis must be a valid object');
    }
    const improvements = [];
    
    if (analysis.clarityScore > 70) improvements.push('improved clarity');
    if (analysis.specificityScore > 70) improvements.push('increased specificity');
    if (analysis.actionabilityScore > 70) improvements.push('enhanced actionability');
    if (analysis.inspirationalScore > 70) improvements.push('boosted inspirational impact');

    const improvementText = improvements.length > 0 
      ? `This refinement focuses on ${improvements.join(', ')}.`
      : 'This refinement addresses several key areas for improvement.';

    return `${improvementText} The updated vision is more focused and provides clearer direction for your starship's mission.`;
  }

  /**
   * Calculates overall confidence based on individual scores
   */
  private calculateOverallConfidence(scores: any): number {
    const avgScore = (
      (scores.clarityScore || 50) +
      (scores.specificityScore || 50) +
      (scores.actionabilityScore || 50) +
      (scores.inspirationalScore || 50)
    ) / 4;

    // Convert score (0-100) to confidence (0-1)
    return Math.min(1, Math.max(0, avgScore / 100));
  }

  /**
   * Creates a fallback analysis when AI service fails
   */
  private createFallbackAnalysis(vision: string): VisionAnalysis {
    const wordCount = vision.split(' ').length;
    const hasSpecificTerms = /\d+|specific|particular|exact/.test(vision.toLowerCase());
    const hasActionVerbs = /will|create|build|develop|achieve|deliver/.test(vision.toLowerCase());
    
    const clarityScore = Math.min(80, wordCount * 2); // Longer visions might be less clear
    const specificityScore = hasSpecificTerms ? 75 : 45;
    const actionabilityScore = hasActionVerbs ? 70 : 40;
    const inspirationalScore = vision.length > 50 ? 60 : 40;
    const overallConfidence = 0.6;
    
    return {
      currentVision: vision,
      clarityScore,
      specificityScore,
      actionabilityScore,
      inspirationalScore,
      strengths: ['Vision statement is present', 'Shows clear intent'],
      weaknesses: ['Could be more specific', 'May need more actionable elements'],
      suggestions: ['Add specific metrics or goals', 'Include timeline elements', 'Make it more inspiring'],
      overallConfidence,
      metrics: {
        clarityScore,
        specificityScore,
        actionabilityScore,
        inspirationalScore,
        hasObjectives: vision.toLowerCase().includes('objective') || vision.toLowerCase().includes('goal'),
        hasTimeframe: /\b(by|within|until|before)\s+\d{4}|\b(month|year|week|day)s?\b/i.test(vision),
        hasMeasurables: /\b(\d+%?|\$[\d,]+|increase|decrease|improve|reduce)\b/i.test(vision),
        overallQuality: (clarityScore + specificityScore + actionabilityScore + inspirationalScore) / 4,
        confidence: overallConfidence,
        refinementCount: 0
      }
    };
  }

  /**
   * Creates a fallback refinement when AI service fails
   */
  private createFallbackRefinement(currentVision: string): VisionRefinementResponse {
    return {
      proposedVision: undefined,
      analysis: this.createFallbackAnalysis(currentVision),
      reasoning: 'Unable to generate refinement at this time. Please try again later.',
      requiresConfirmation: false,
      confidenceLevel: 0.3
    };
  }
  
  // Performance optimization helper methods
  
  /**
   * Retrieves cached analysis if available and not expired
   */
  private getCachedAnalysis(vision: string): VisionAnalysis | null {
    const key = this.hashString(vision);
    const cached = VisionRefinementService.analysisCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < VisionRefinementService.CACHE_TTL) {
      return cached.analysis;
    }
    
    // Remove expired entry
    if (cached) {
      VisionRefinementService.analysisCache.delete(key);
    }
    
    return null;
  }
  
  /**
   * Caches analysis result
   */
  private setCachedAnalysis(vision: string, analysis: VisionAnalysis): void {
    const key = this.hashString(vision);
    VisionRefinementService.analysisCache.set(key, {
      analysis,
      timestamp: Date.now()
    });
  }
  
  /**
   * Creates a simple hash of a string for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }
  
  /**
   * Cleans up expired cache entries and performance data
   */
  private cleanupCaches(): void {
    const now = Date.now();
    let removedCount = 0;
    
    // Cleanup analysis cache
    for (const [key, entry] of VisionRefinementService.analysisCache) {
      if (now - entry.timestamp > VisionRefinementService.CACHE_TTL) {
        VisionRefinementService.analysisCache.delete(key);
        removedCount++;
      }
    }
    
    // Cleanup memoizer cache
    const memoStats = this.memoizer.getStats();
    this.memoizer.cleanupExpired();
    
    if (removedCount > 0 || memoStats.expired > 0) {
      console.log('Cache cleanup completed:', {
        analysisCache: {
          removed: removedCount,
          remaining: VisionRefinementService.analysisCache.size
        },
        memoizer: {
          size: memoStats.size,
          expired: memoStats.expired,
          memoryBytes: memoStats.memory
        },
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Gets performance statistics for monitoring
   */
  public getPerformanceStats(): {
    cacheSize: number;
    rateLimiterState: any;
    circuitBreakerState: string;
    memoizerStats: any;
  } {
    return {
      cacheSize: VisionRefinementService.analysisCache.size,
      rateLimiterState: {
        // Note: RateLimiter doesn't expose internal state by default
        // This would need to be enhanced if detailed stats are needed
      },
      circuitBreakerState: this.circuitBreaker.getState(),
      memoizerStats: this.memoizer.getStats()
    };
  }
  
  /**
   * Clears all caches and resets performance components
   */
  public resetPerformanceState(): void {
    VisionRefinementService.analysisCache.clear();
    this.memoizer.clearAll();
    this.rateLimiter.clear();
    this.circuitBreaker.reset();
    
    console.log('Performance state reset completed', {
      timestamp: new Date().toISOString()
    });
  }
}