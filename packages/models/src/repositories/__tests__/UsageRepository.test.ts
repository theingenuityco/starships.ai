/**
 * UsageRepository Unit Tests
 */

import 'reflect-metadata';
import { UsageRepository } from '../UsageRepository';
import { UsageEntity } from '@/entities/UsageEntity';
import { DatabaseError } from '@starships/errors';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';

// Mock nanoid for predictable IDs
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-usage-id-123'),
}));

// Mock the database connection
jest.mock('@/helpers/database', () => ({
  getConnection: jest.fn(),
}));

// Mock entity validation
jest.spyOn(UsageEntity, 'validate').mockResolvedValue(undefined);

describe('UsageRepository', () => {
  let repository: UsageRepository;
  let testHelper: RepositoryTestHelper;

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    repository = new UsageRepository();
    testHelper.reset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as unknown as { serviceName: string }).serviceName).toBe('UsageRepository');
    });
  });

  describe('createAndLink', () => {
    it('should create usage record successfully', async () => {
      const usageData = {
        starshipId: 'starship-123',
        conversationId: 'conversation-456',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.003,
        model: 'gpt-4',
      };

      const mockCreatedUsage = {
        id: 'test-usage-id-123',
        starship_id: 'starship-123',
        conversation_id: 'conversation-456',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost: 0.003,
        model: 'gpt-4',
        created_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedUsage]);

      const result = await repository.createAndLink(usageData);

      expect(UsageEntity.validate).toHaveBeenCalled();
      expect(result.starshipId).toBe('starship-123');
      expect(result.conversationId).toBe('conversation-456');
      expect(result.promptTokens).toBe(100);
      expect(result.completionTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
      expect(result.cost).toBe(0.003);
    });

    it('should use default model when not provided', async () => {
      const usageData = {
        starshipId: 'starship-123',
        conversationId: 'conversation-456',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.003,
      };

      const mockCreatedUsage = {
        id: 'test-usage-id-123',
        starship_id: 'starship-123',
        conversation_id: 'conversation-456',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost: 0.003,
        model: 'unknown',
        created_at: '2024-01-01T00:00:00.000Z',
      };

      testHelper.mockConnection.query.mockResolvedValue([mockCreatedUsage]);

      const result = await repository.createAndLink(usageData);

      expect(result.model).toBe('unknown');
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();

      await expect(
        repository.createAndLink({
          starshipId: 'starship-123',
          conversationId: 'conversation-456',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.003,
        })
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('getTotalsByConversation', () => {
    it('should return aggregated usage totals for conversation', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({
        prompt_tokens: '500',
        completion_tokens: '250',
        total_tokens: '750',
        cost: '0.015',
      });

      const result = await repository.getTotalsByConversation('conversation-123');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith(expect.stringContaining('SELECT'), ['conversation-123']);
      expect(result.promptTokens).toBe(500);
      expect(result.completionTokens).toBe(250);
      expect(result.totalTokens).toBe(750);
      expect(result.cost).toBe(0.015);
    });

    it('should return zeros when no usage found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({
        prompt_tokens: '0',
        completion_tokens: '0',
        total_tokens: '0',
        cost: '0',
      });

      const result = await repository.getTotalsByConversation('conversation-123');

      expect(result.promptTokens).toBe(0);
      expect(result.completionTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.cost).toBe(0);
    });

    it('should throw error for missing conversationId', async () => {
      await expect(repository.getTotalsByConversation('')).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();
      await expect(repository.getTotalsByConversation('conversation-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getTotalsByStarship', () => {
    it('should return aggregated usage totals for starship', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({
        prompt_tokens: '1000',
        completion_tokens: '500',
        total_tokens: '1500',
        cost: '0.030',
      });

      const result = await repository.getTotalsByStarship('starship-123');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith(expect.stringContaining('SELECT'), ['starship-123']);
      expect(result.promptTokens).toBe(1000);
      expect(result.completionTokens).toBe(500);
      expect(result.totalTokens).toBe(1500);
      expect(result.cost).toBe(0.03);
    });

    it('should return zeros when no usage found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({
        prompt_tokens: '0',
        completion_tokens: '0',
        total_tokens: '0',
        cost: '0',
      });

      const result = await repository.getTotalsByStarship('starship-123');

      expect(result.promptTokens).toBe(0);
      expect(result.completionTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.cost).toBe(0);
    });

    it('should throw error for missing starshipId', async () => {
      await expect(repository.getTotalsByStarship('')).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();
      await expect(repository.getTotalsByStarship('starship-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('listByConversation', () => {
    it('should list usage records for conversation', async () => {
      const mockUsageRecords = [
        {
          id: 'usage-1',
          starship_id: 'starship-123',
          conversation_id: 'conversation-456',
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.003,
          model: 'gpt-4',
          created_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'usage-2',
          starship_id: 'starship-123',
          conversation_id: 'conversation-456',
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
          cost: 0.006,
          model: 'gpt-4',
          created_at: '2024-01-01T01:00:00.000Z',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockUsageRecords);

      const result = await repository.listByConversation('conversation-456');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM usage'), [
        'conversation-456',
        100,
        0,
      ]);
      expect(result).toHaveLength(2);
      expect(result[0].promptTokens).toBe(100);
      expect(result[1].promptTokens).toBe(200);
    });

    it('should handle pagination options', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      await repository.listByConversation('conversation-456', { limit: 50, offset: 10 });

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith(expect.any(String), ['conversation-456', 50, 10]);
    });

    it('should enforce max limit of 200', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      await repository.listByConversation('conversation-456', { limit: 500 });

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith(expect.any(String), ['conversation-456', 200, 0]);
    });

    it('should enforce min limit of 1', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      await repository.listByConversation('conversation-456', { limit: 0 });

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith(expect.any(String), ['conversation-456', 1, 0]);
    });

    it('should enforce min offset of 0', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      await repository.listByConversation('conversation-456', { offset: -10 });

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith(expect.any(String), ['conversation-456', 100, 0]);
    });

    it('should throw error for missing conversationId', async () => {
      await expect(repository.listByConversation('')).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();
      await expect(repository.listByConversation('conversation-456')).rejects.toThrow(DatabaseError);
    });
  });
});
