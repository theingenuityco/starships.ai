import { RepositoryFactory } from '@starships/models';
import { SessionModel, SessionRequest, SessionResponse, SessionSourceType } from '@starships/protocol';

/**
 * Service for managing chat sessions
 * Provides high-level operations for session management, creation, and updates
 */
export class SessionService {
  /**
   * Create a new session
   */
  static async createSession(data: {
    source: SessionSourceType;
    userId: string;
    agentId?: string;
    starshipId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SessionModel> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      
      const session = await sessionRepo.create({
        source: data.source,
        userId: data.userId,
        agentId: data.agentId,
        starshipId: data.starshipId,
        lastActivityAt: new Date().toISOString(),
        messageCount: 0,
        totalTokens: 0,
        status: 'active',
        metadata: data.metadata
      });

      console.log(`[SESSION-SERVICE] Created new session: ${session.id} for user: ${data.userId}`);
      return session;
    } catch (error) {
      console.error('[SESSION-SERVICE] Failed to create session:', error);
      throw new Error(`Failed to create session: ${error}`);
    }
  }

  /**
   * Get session by ID
   */
  static async getSessionById(id: string): Promise<SessionModel | null> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      return await sessionRepo.findById(id);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to get session ${id}:`, error);
      throw new Error(`Failed to get session: ${error}`);
    }
  }

  /**
   * Get sessions for a user
   */
  static async getUserSessions(userId: string): Promise<SessionModel[]> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      return await sessionRepo.findByUserId(userId);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to get sessions for user ${userId}:`, error);
      throw new Error(`Failed to get user sessions: ${error}`);
    }
  }

  /**
   * Get active sessions for a user
   */
  static async getActiveUserSessions(userId: string): Promise<SessionModel[]> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      return await sessionRepo.findActiveByUser(userId);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to get active sessions for user ${userId}:`, error);
      throw new Error(`Failed to get active user sessions: ${error}`);
    }
  }

  /**
   * Get sessions for a starship
   */
  static async getStarshipSessions(starshipId: string): Promise<SessionModel[]> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      return await sessionRepo.findByStarshipId(starshipId);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to get sessions for starship ${starshipId}:`, error);
      throw new Error(`Failed to get starship sessions: ${error}`);
    }
  }

  /**
   * Get sessions for an agent
   */
  static async getAgentSessions(agentId: string): Promise<SessionModel[]> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      return await sessionRepo.findByAgentId(agentId);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to get sessions for agent ${agentId}:`, error);
      throw new Error(`Failed to get agent sessions: ${error}`);
    }
  }

  /**
   * Update session activity
   */
  static async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      await sessionRepo.updateActivity(sessionId);
      console.log(`[SESSION-SERVICE] Updated activity for session: ${sessionId}`);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to update activity for session ${sessionId}:`, error);
      throw new Error(`Failed to update session activity: ${error}`);
    }
  }

  /**
   * Increment message count for a session
   */
  static async incrementMessageCount(sessionId: string, increment: number = 1): Promise<void> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      await sessionRepo.incrementMessageCount(sessionId, increment);
      console.log(`[SESSION-SERVICE] Incremented message count for session: ${sessionId} by ${increment}`);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to increment message count for session ${sessionId}:`, error);
      throw new Error(`Failed to increment message count: ${error}`);
    }
  }

  /**
   * Update token usage for a session
   */
  static async updateTokenCount(sessionId: string, tokens: number): Promise<void> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      await sessionRepo.updateTokenCount(sessionId, tokens);
      console.log(`[SESSION-SERVICE] Updated token count for session: ${sessionId} with ${tokens} tokens`);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to update token count for session ${sessionId}:`, error);
      throw new Error(`Failed to update token count: ${error}`);
    }
  }

  /**
   * Complete a session
   */
  static async completeSession(sessionId: string): Promise<void> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      await sessionRepo.markAsCompleted(sessionId);
      console.log(`[SESSION-SERVICE] Completed session: ${sessionId}`);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to complete session ${sessionId}:`, error);
      throw new Error(`Failed to complete session: ${error}`);
    }
  }

  /**
   * Archive a session
   */
  static async archiveSession(sessionId: string): Promise<void> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      await sessionRepo.archiveSession(sessionId);
      console.log(`[SESSION-SERVICE] Archived session: ${sessionId}`);
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to archive session ${sessionId}:`, error);
      throw new Error(`Failed to archive session: ${error}`);
    }
  }

  /**
   * Delete a session
   */
  static async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionRepo = RepositoryFactory.getSessionRepository();
      const deleted = await sessionRepo.delete(sessionId);
      console.log(`[SESSION-SERVICE] Deleted session: ${sessionId}`);
      return deleted;
    } catch (error) {
      console.error(`[SESSION-SERVICE] Failed to delete session ${sessionId}:`, error);
      throw new Error(`Failed to delete session: ${error}`);
    }
  }
}