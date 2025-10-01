/**
 * WaitlistRepository Unit Tests
 */

import 'reflect-metadata';
import { WaitlistRepository } from '../WaitlistRepository';
import { ValidationError, DatabaseError } from '@starships/errors';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';

// Mock the database connection
jest.mock('@/helpers/database', () => ({
  getConnection: jest.fn(),
}));

describe('WaitlistRepository', () => {
  let repository: WaitlistRepository;
  let testHelper: RepositoryTestHelper;

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    repository = new WaitlistRepository();
    testHelper.reset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as unknown as { serviceName: string }).serviceName).toBe('WaitlistRepository');
    });
  });

  describe('checkApproval', () => {
    it('should return true for approved email', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({ exists: true });

      const result = await repository.checkApproval('approved@example.com');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith(expect.stringContaining('EXISTS'), [
        'approved@example.com',
        'approved',
      ]);
      expect(result).toBe(true);
    });

    it('should return false for non-approved email', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({ exists: false });

      const result = await repository.checkApproval('pending@example.com');

      expect(result).toBe(false);
    });

    it('should normalize email to lowercase', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({ exists: true });

      await repository.checkApproval('Test@Example.COM');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith(expect.any(String), ['test@example.com', 'approved']);
    });

    it('should throw error for invalid email', async () => {
      await expect(repository.checkApproval('invalid-email')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();
      await expect(repository.checkApproval('test@example.com')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByEmail', () => {
    it('should return waitlist entry by email', async () => {
      const mockEntry = {
        email: 'test@example.com',
        status: 'approved',
        created_at: '2024-01-01T00:00:00.000Z',
        notes: 'Test user',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockEntry);

      const result = await repository.getByEmail('test@example.com');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('SELECT email, status, created_at, notes FROM waitlist'),
        ['test@example.com']
      );
      expect(result).not.toBeNull();
      expect(result!.email).toBe('test@example.com');
      expect(result!.status).toBe('approved');
    });

    it('should return null when email not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.getByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should throw error for invalid email', async () => {
      await expect(repository.getByEmail('invalid-email')).rejects.toThrow(ValidationError);
    });
  });

  describe('addApprovedEmail', () => {
    it('should add approved email successfully', async () => {
      const mockEntry = {
        email: 'new@example.com',
        status: 'approved',
        created_at: '2024-01-01T00:00:00.000Z',
        notes: 'New user',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockEntry);

      const result = await repository.addApprovedEmail('new@example.com', 'New user');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO waitlist'), [
        'new@example.com',
        'approved',
        'New user',
        expect.any(String),
      ]);
      expect(result.email).toBe('new@example.com');
      expect(result.status).toBe('approved');
    });

    it('should handle upsert on conflict', async () => {
      const mockEntry = {
        email: 'existing@example.com',
        status: 'approved',
        created_at: '2024-01-01T00:00:00.000Z',
        notes: 'Updated notes',
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockEntry);

      const result = await repository.addApprovedEmail('existing@example.com', 'Updated notes');

      expect(result.email).toBe('existing@example.com');
    });

    it('should throw error for invalid email', async () => {
      await expect(repository.addApprovedEmail('invalid-email')).rejects.toThrow(ValidationError);
    });
  });

  describe('addPendingEmail', () => {
    it('should add pending email successfully', async () => {
      const mockEntry = {
        email: 'pending@example.com',
        status: 'pending',
        created_at: '2024-01-01T00:00:00.000Z',
        notes: null,
      };

      testHelper.mockConnection.queryOne.mockResolvedValue(mockEntry);

      const result = await repository.addPendingEmail('pending@example.com');

      expect(testHelper.mockConnection.queryOne).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO waitlist'), [
        'pending@example.com',
        'pending',
        null,
        expect.any(String),
      ]);
      expect(result.email).toBe('pending@example.com');
      expect(result.status).toBe('pending');
    });

    it('should return existing entry on duplicate', async () => {
      const constraintError = Object.assign(new Error('duplicate key'), { code: '23505' });
      testHelper.mockConnection.queryOne.mockRejectedValueOnce(constraintError);

      const existingEntry = {
        email: 'existing@example.com',
        status: 'pending',
        created_at: '2024-01-01T00:00:00.000Z',
        notes: null,
      };
      testHelper.mockConnection.queryOne.mockResolvedValueOnce(existingEntry);

      const result = await repository.addPendingEmail('existing@example.com');

      expect(result.email).toBe('existing@example.com');
    });

    it('should throw error for invalid email', async () => {
      await expect(repository.addPendingEmail('invalid-email')).rejects.toThrow(ValidationError);
    });
  });

  describe('getStatusByEmail', () => {
    it('should return approved status', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({ status: 'approved' });

      const result = await repository.getStatusByEmail('test@example.com');

      expect(result).toBe('approved');
    });

    it('should return pending status', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({ status: 'pending' });

      const result = await repository.getStatusByEmail('test@example.com');

      expect(result).toBe('pending');
    });

    it('should return null when email not found', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);

      const result = await repository.getStatusByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should throw error for invalid email', async () => {
      await expect(repository.getStatusByEmail('invalid-email')).rejects.toThrow(ValidationError);
    });
  });

  describe('updateStatus', () => {
    it('should update status successfully', async () => {
      testHelper.mockConnection.query.mockResolvedValue([{ email: 'test@example.com' }]);

      const result = await repository.updateStatus('test@example.com', 'approved');

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE waitlist SET status'), [
        'test@example.com',
        'approved',
      ]);
      expect(result).toBe(true);
    });

    it('should return false when email not found', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.updateStatus('nonexistent@example.com', 'approved');

      expect(result).toBe(false);
    });

    it('should throw error for invalid email', async () => {
      await expect(repository.updateStatus('invalid-email', 'approved')).rejects.toThrow(ValidationError);
    });
  });

  describe('getAllApproved', () => {
    it('should return all approved emails', async () => {
      const mockEntries = [
        {
          email: 'approved1@example.com',
          status: 'approved',
          created_at: '2024-01-01T00:00:00.000Z',
          notes: null,
        },
        {
          email: 'approved2@example.com',
          status: 'approved',
          created_at: '2024-01-02T00:00:00.000Z',
          notes: 'Test user',
        },
      ];

      testHelper.mockConnection.query.mockResolvedValue(mockEntries);

      const result = await repository.getAllApproved();

      expect(testHelper.mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('WHERE status = $1'), ['approved']);
      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('approved1@example.com');
      expect(result[1].email).toBe('approved2@example.com');
    });

    it('should handle empty result', async () => {
      testHelper.mockConnection.query.mockResolvedValue([]);

      const result = await repository.getAllApproved();

      expect(result).toEqual([]);
    });
  });

  describe('getApprovedCount', () => {
    it('should return count of approved emails', async () => {
      testHelper.mockConnection.queryCount.mockResolvedValue(5);

      const result = await repository.getApprovedCount();

      expect(testHelper.mockConnection.queryCount).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) FROM waitlist WHERE status'),
        ['approved']
      );
      expect(result).toBe(5);
    });

    it('should return 0 when no approved emails', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({ count: '0' });

      const result = await repository.getApprovedCount();

      expect(result).toBe(0);
    });
  });

  describe('initializeSchema', () => {
    it('should log that schema is already defined', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await repository.initializeSchema();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('PostgreSQL waitlist schema'));
      consoleSpy.mockRestore();
    });
  });

  describe('seedInitialEmails', () => {
    it('should seed initial emails', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue(null);
      testHelper.mockConnection.query.mockResolvedValue([
        {
          email: 'dewang@theingenuity.co',
          status: 'approved',
          created_at: '2024-01-01T00:00:00.000Z',
          notes: 'Founder - Primary tester',
        },
      ]);

      await repository.seedInitialEmails();

      // Should have called getByEmail and addApprovedEmail for each email
      expect(testHelper.mockConnection.queryOne).toHaveBeenCalled();
    });

    it('should skip existing emails', async () => {
      testHelper.mockConnection.queryOne.mockResolvedValue({
        email: 'dewang@theingenuity.co',
        status: 'approved',
        created_at: '2024-01-01T00:00:00.000Z',
        notes: 'Founder - Primary tester',
      });

      await repository.seedInitialEmails();

      // Should only check if email exists, not add it
      expect(testHelper.mockConnection.queryOne).toHaveBeenCalled();
    });
  });
});
