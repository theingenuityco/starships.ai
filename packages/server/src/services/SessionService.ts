import { SessionRepository } from '@starships/models';
import { SessionModel } from '@starships/protocol';

export interface CreateSessionData {
  metadata?: Record<string, unknown>;
}

export interface SessionServiceDependencies {
  sessionRepository: SessionRepository;
}

/**
 * Clean session service with dependency injection and proper error handling
 */
export class SessionService {
  constructor(private readonly dependencies: SessionServiceDependencies) {}

  /**
   * Create a new session
   */
  async createSession(data: CreateSessionData): Promise<SessionModel> {
    const { sessionRepository } = this.dependencies;

    const session = await sessionRepository.create({
      lastActivityAt: new Date().toISOString(),
      messageCount: 0,
      totalTokens: 0,
      status: 'active',
      metadata: data.metadata,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  async getSessionById(id: string): Promise<SessionModel | null> {
    const { sessionRepository } = this.dependencies;
    return sessionRepository.findById(id);
  }

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    const { sessionRepository } = this.dependencies;
    await sessionRepository.updateActivity(sessionId);
  }

  /**
   * Increment message count for a session
   */
  async incrementMessageCount(sessionId: string, increment: number = 1): Promise<void> {
    const { sessionRepository } = this.dependencies;
    await sessionRepository.incrementMessageCount(sessionId, increment);
  }

  /**
   * Update token usage for a session
   */
  async updateTokenCount(sessionId: string, tokens: number): Promise<void> {
    const { sessionRepository } = this.dependencies;
    await sessionRepository.updateTokenCount(sessionId, tokens);
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: string): Promise<void> {
    const { sessionRepository } = this.dependencies;
    await sessionRepository.markAsCompleted(sessionId);
  }

  /**
   * Archive a session
   */
  async archiveSession(sessionId: string): Promise<void> {
    const { sessionRepository } = this.dependencies;
    await sessionRepository.archiveSession(sessionId);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const { sessionRepository } = this.dependencies;
    return sessionRepository.delete(sessionId);
  }
}

/**
 * Default service instance factory
 */
export const createSessionService = (): SessionService => {
  return new SessionService({
    sessionRepository: new SessionRepository(),
  });
};
