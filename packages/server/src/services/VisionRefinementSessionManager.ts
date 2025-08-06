/**
 * VisionRefinementSessionManager handles session state for vision refinement conversations
 * 
 * This service manages multi-turn conversations for vision refinement, maintaining:
 * - Session state across multiple chat interactions
 * - Conversation history and context
 * - Proposed vision states and user feedback
 * - Session timeouts and cleanup
 */

export interface VisionRefinementSession {
  sessionId: string;
  starshipId: string;
  userId: string;
  startedAt: Date;
  lastActivity: Date;
  currentVision: string;
  proposedVision?: string;
  awaitingConfirmation: boolean;
  conversationContext: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    metadata?: {
      isVisionRelated?: boolean;
      proposalIncluded?: boolean;
      userIntent?: 'accept' | 'reject' | 'modify' | 'unclear';
    };
  }>;
  refinementCount: number;
  userFeedback: string[];
  sessionMetadata: {
    detectedIntent: 'initial_discussion' | 'refinement_request' | 'iterative_feedback' | 'final_confirmation';
    confidenceLevel: number;
    lastProposalTimestamp?: number;
    totalInteractions: number;
  };
}

export class VisionRefinementSessionManager {
  private sessions: Map<string, VisionRefinementSession> = new Map();
  private userToSessionMap: Map<string, string> = new Map(); // userId -> sessionId
  private readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_CONTEXT_MESSAGES = 15; // Keep last 15 messages
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  
  constructor() {
    // Start periodic cleanup of expired sessions
    this.startSessionCleanup();
  }

  /**
   * Gets existing session or creates new one for user and starship
   */
  getOrCreateSession(userId: string, starshipId: string, currentVision: string): VisionRefinementSession {
    // Check if user has an active session
    const existingSessionId = this.userToSessionMap.get(userId);
    let session: VisionRefinementSession | undefined;

    if (existingSessionId) {
      session = this.sessions.get(existingSessionId);
      
      // Validate session is still valid and for same starship
      if (session && session.starshipId === starshipId && !this.isSessionExpired(session)) {
        this.updateLastActivity(session.sessionId);
        return session;
      } else if (session) {
        // Clean up stale session
        this.clearSession(session.sessionId);
      }
    }

    // Create new session
    const sessionId = this.generateSessionId(userId, starshipId);
    const now = new Date();
    
    session = {
      sessionId,
      starshipId,
      userId,
      startedAt: now,
      lastActivity: now,
      currentVision,
      awaitingConfirmation: false,
      conversationContext: [],
      refinementCount: 0,
      userFeedback: [],
      sessionMetadata: {
        detectedIntent: 'initial_discussion',
        confidenceLevel: 0.5,
        totalInteractions: 0
      }
    };

    this.sessions.set(sessionId, session);
    this.userToSessionMap.set(userId, sessionId);
    
    return session;
  }

  /**
   * Gets the current session for a user if one exists
   */
  getSessionForUser(userId: string): VisionRefinementSession | null {
    const sessionId = this.userToSessionMap.get(userId);
    if (!sessionId) return null;
    
    const session = this.sessions.get(sessionId);
    if (!session || this.isSessionExpired(session)) {
      // Clean up expired session
      if (session) {
        this.clearSession(session.sessionId);
      }
      return null;
    }
    
    return session;
  }

  /**
   * Updates session with new conversation message
   */
  updateSession(sessionId: string, updates: Partial<VisionRefinementSession>): VisionRefinementSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Update session properties
    Object.assign(session, updates);
    session.lastActivity = new Date();
    
    // Trim conversation context if too long
    if (session.conversationContext.length > this.MAX_CONTEXT_MESSAGES) {
      session.conversationContext = session.conversationContext.slice(-this.MAX_CONTEXT_MESSAGES);
    }

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Adds a conversation message to the session
   */
  addMessage(
    sessionId: string, 
    role: 'user' | 'assistant', 
    content: string,
    metadata?: VisionRefinementSession['conversationContext'][0]['metadata']
  ): VisionRefinementSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.conversationContext.push({
      role,
      content,
      timestamp: Date.now(),
      metadata
    });

    session.sessionMetadata.totalInteractions++;
    session.lastActivity = new Date();

    // Trim context if needed
    if (session.conversationContext.length > this.MAX_CONTEXT_MESSAGES) {
      session.conversationContext = session.conversationContext.slice(-this.MAX_CONTEXT_MESSAGES);
    }

    return session;
  }

  /**
   * Sets awaiting confirmation state with proposed vision
   */
  setAwaitingConfirmation(sessionId: string, proposedVision: string, confidenceLevel: number): VisionRefinementSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.proposedVision = proposedVision;
    session.awaitingConfirmation = true;
    session.sessionMetadata.confidenceLevel = confidenceLevel;
    session.sessionMetadata.lastProposalTimestamp = Date.now();
    session.lastActivity = new Date();

    return session;
  }

  /**
   * Accepts proposed vision and updates session state
   */
  acceptProposal(sessionId: string): VisionRefinementSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.proposedVision) return null;

    session.currentVision = session.proposedVision;
    session.proposedVision = undefined;
    session.awaitingConfirmation = false;
    session.refinementCount++;
    session.sessionMetadata.detectedIntent = 'final_confirmation';
    session.lastActivity = new Date();

    return session;
  }

  /**
   * Rejects proposed vision and resets confirmation state
   */
  rejectProposal(sessionId: string, feedback?: string[]): VisionRefinementSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.proposedVision = undefined;
    session.awaitingConfirmation = false;
    session.sessionMetadata.detectedIntent = 'iterative_feedback';
    
    if (feedback) {
      session.userFeedback = session.userFeedback.concat(feedback);
    }
    
    session.lastActivity = new Date();
    return session;
  }

  /**
   * Gets session by ID
   */
  getSession(sessionId: string): VisionRefinementSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || this.isSessionExpired(session)) {
      if (session) this.clearSession(sessionId);
      return null;
    }
    return session;
  }

  /**
   * Gets session by user ID
   */
  getSessionByUser(userId: string): VisionRefinementSession | null {
    const sessionId = this.userToSessionMap.get(userId);
    if (!sessionId) return null;
    
    return this.getSession(sessionId);
  }

  /**
   * Clears a specific session
   */
  clearSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.sessions.delete(sessionId);
    this.userToSessionMap.delete(session.userId);
    return true;
  }

  /**
   * Clears all sessions for a user
   */
  clearUserSessions(userId: string): void {
    const sessionId = this.userToSessionMap.get(userId);
    if (sessionId) {
      this.clearSession(sessionId);
    }
  }

  /**
   * Gets conversation history from session
   */
  getConversationHistory(sessionId: string, limit?: number): Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    if (limit && limit > 0) {
      return session.conversationContext.slice(-limit);
    }
    
    return session.conversationContext;
  }

  /**
   * Updates session metadata
   */
  updateSessionMetadata(sessionId: string, metadata: Partial<VisionRefinementSession['sessionMetadata']>): VisionRefinementSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    Object.assign(session.sessionMetadata, metadata);
    session.lastActivity = new Date();
    
    return session;
  }

  /**
   * Gets session statistics
   */
  getSessionStats(): {
    totalActiveSessions: number;
    sessionsAwaitingConfirmation: number;
    averageRefinementCount: number;
    oldestSessionAge: number;
  } {
    const activeSessions = Array.from(this.sessions.values()).filter(
      session => !this.isSessionExpired(session)
    );

    const awaitingConfirmation = activeSessions.filter(
      session => session.awaitingConfirmation
    ).length;

    const avgRefinementCount = activeSessions.length > 0 
      ? activeSessions.reduce((sum, session) => sum + session.refinementCount, 0) / activeSessions.length
      : 0;

    const oldestSessionAge = activeSessions.length > 0
      ? Math.max(...activeSessions.map(session => Date.now() - session.startedAt.getTime()))
      : 0;

    return {
      totalActiveSessions: activeSessions.length,
      sessionsAwaitingConfirmation: awaitingConfirmation,
      averageRefinementCount: Math.round(avgRefinementCount * 100) / 100,
      oldestSessionAge
    };
  }

  /**
   * Checks if session is expired
   */
  private isSessionExpired(session: VisionRefinementSession): boolean {
    const now = Date.now();
    return (now - session.lastActivity.getTime()) > this.SESSION_TTL_MS;
  }

  /**
   * Updates last activity timestamp
   */
  private updateLastActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Generates unique session ID
   */
  private generateSessionId(userId: string, starshipId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return `vision_${starshipId}_${userId}_${timestamp}_${random}`;
  }

  /**
   * Starts periodic session cleanup
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Cleans up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        expiredSessions.push(sessionId);
      }
    }
    
    expiredSessions.forEach(sessionId => {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.userToSessionMap.delete(session.userId);
        this.sessions.delete(sessionId);
      }
    });

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired vision refinement sessions`);
    }
  }
}