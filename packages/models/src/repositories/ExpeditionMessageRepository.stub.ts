/**
 * Expedition Message Repository (STUB IMPLEMENTATION)
 * 
 * This is a stub implementation for compilation compatibility only.
 * The actual expedition functionality has been disconnected.
 */

import {
  ExpeditionMessage,
  ExpeditionMessageRepository as IExpeditionMessageRepository,
  MessageRole,
  MessageType
} from '../types';

export class ExpeditionMessageRepository implements IExpeditionMessageRepository {
  async findAll(): Promise<ExpeditionMessage[]> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return [];
  }

  async findById(id: string): Promise<ExpeditionMessage | null> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return null;
  }

  async create(entity: Omit<ExpeditionMessage, 'id' | 'createdAt'>): Promise<ExpeditionMessage> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    throw new Error('Expedition functionality is disconnected');
  }

  async update(id: string, updates: Partial<ExpeditionMessage>): Promise<ExpeditionMessage | null> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return null;
  }

  async delete(id: string): Promise<boolean> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return false;
  }

  async findByExpedition(
    expeditionId: string,
    limit?: number,
    offset?: number
  ): Promise<ExpeditionMessage[]> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return [];
  }

  async findByRole(expeditionId: string, role: MessageRole): Promise<ExpeditionMessage[]> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return [];
  }

  async findByType(expeditionId: string, messageType: MessageType): Promise<ExpeditionMessage[]> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return [];
  }

  async findByThread(threadId: string): Promise<ExpeditionMessage[]> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return [];
  }

  async findByAgent(expeditionId: string, agentId: string): Promise<ExpeditionMessage[]> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return [];
  }

  async getMessageCount(expeditionId: string): Promise<number> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return 0;
  }

  async getLatestMessages(expeditionId: string, limit: number): Promise<ExpeditionMessage[]> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return [];
  }

  async searchMessages(expeditionId: string, query: string): Promise<ExpeditionMessage[]> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return [];
  }

  async deleteByExpedition(expeditionId: string): Promise<boolean> {
    console.warn('ExpeditionMessageRepository: Expedition functionality is disconnected');
    return false;
  }
}