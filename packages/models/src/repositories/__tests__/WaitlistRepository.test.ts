/**
 * WaitlistRepository Unit Tests
 */

import { PostgresConnection } from '@/helpers/database';
import { WaitlistRepository } from '@/repositories/WaitlistRepository';
import { ConflictError, DatabaseError, ValidationError } from '@starships/errors';
import type { WaitlistEntryModel } from '@starships/protocol';

// Mock dependencies
jest.mock('../../helpers/database/connection');

describe('WaitlistRepository', () => {
  let repository: WaitlistRepository;
  let mockConnection: jest.Mocked<Neo4jConnection>;

  beforeEach(() => {
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    } as unknown as jest.Mocked<Neo4jConnection>;

    repository = new WaitlistRepository();
    jest.clearAllMocks();
  });

  const createMockWaitlistEntry = (overrides: Partial<WaitlistEntryModel> = {}): WaitlistEntryModel => ({
    email: 'test@example.com',
    status: 'approved',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    notes: 'Test entry',
    ...overrides,
  });

  describe('constructor', () => {
    it('should create repository with connection', () => {
      expect(repository).toBeInstanceOf(WaitlistRepository);
    });
  });

  describe('checkApproval', () => {
    it('should return true for approved email', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ isApproved: true }]);

      const result = await repository.checkApproval('test@example.com');

      expect(result).toBe(true);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("MATCH (w:Waitlist {email: $email, status: 'approved'})"),
        { email: 'test@example.com' }
      );
    });

    it('should return false for non-approved email', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.checkApproval('notapproved@example.com');

      expect(result).toBe(false);
    });

    it('should normalize email to lowercase', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ isApproved: true }]);

      await repository.checkApproval('TEST@EXAMPLE.COM');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.any(String), {
        email: 'test@example.com',
      });
    });

    it('should validate email format', async () => {
      await expect(repository.checkApproval('invalid-email')).rejects.toThrow(ValidationError);
      await expect(repository.checkApproval('@example.com')).rejects.toThrow(ValidationError);
      await expect(repository.checkApproval('test@')).rejects.toThrow(ValidationError);
      await expect(repository.checkApproval('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.checkApproval('test@example.com')).rejects.toThrow(DatabaseError);
    });

    it('should trim whitespace from email', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ isApproved: true }]);

      await repository.checkApproval('  test@example.com  ');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.any(String), {
        email: 'test@example.com',
      });
    });
  });

  describe('getByEmail', () => {
    it('should return waitlist entry when found', async () => {
      const mockEntry = createMockWaitlistEntry();
      mockConnection.executeQuery.mockResolvedValue([{ entry: mockEntry }]);

      const result = await repository.getByEmail('test@example.com');

      expect(result).toEqual(mockEntry);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('MATCH (w:Waitlist {email: $email})'), {
        email: 'test@example.com',
      });
    });

    it('should return null when entry not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getByEmail('notfound@example.com');

      expect(result).toBeNull();
    });

    it('should normalize email', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      await repository.getByEmail('CAPS@EXAMPLE.COM');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.any(String), {
        email: 'caps@example.com',
      });
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getByEmail('test@example.com')).rejects.toThrow(DatabaseError);
    });
  });

  describe('addApprovedEmail', () => {
    it('should add approved email successfully', async () => {
      const mockEntry = createMockWaitlistEntry();
      mockConnection.executeWrite.mockResolvedValue([{ entry: mockEntry }]);

      const result = await repository.addApprovedEmail('test@example.com', 'Test notes');

      expect(result).toEqual(mockEntry);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (w:Waitlist'),
        expect.objectContaining({
          email: 'test@example.com',
          notes: 'Test notes',
        })
      );
    });

    it('should handle no notes provided', async () => {
      const mockEntry = createMockWaitlistEntry();
      mockConnection.executeWrite.mockResolvedValue([{ entry: mockEntry }]);

      await repository.addApprovedEmail('test@example.com');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          email: 'test@example.com',
          notes: null,
        })
      );
    });

    it('should handle null notes', async () => {
      const mockEntry = createMockWaitlistEntry();
      mockConnection.executeWrite.mockResolvedValue([{ entry: mockEntry }]);

      await repository.addApprovedEmail('test@example.com');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          notes: null,
        })
      );
    });

    it('should validate email format', async () => {
      await expect(repository.addApprovedEmail('invalid-email')).rejects.toThrow(ValidationError);
    });

    it('should normalize email', async () => {
      const mockEntry = createMockWaitlistEntry();
      mockConnection.executeWrite.mockResolvedValue([{ entry: mockEntry }]);

      await repository.addApprovedEmail('  CAPS@EXAMPLE.COM  ');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          email: 'caps@example.com',
        })
      );
    });

    it('should throw DatabaseError when creation fails', async () => {
      mockConnection.executeWrite.mockResolvedValue([]); // No results

      await expect(repository.addApprovedEmail('test@example.com')).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.addApprovedEmail('test@example.com')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getAllApproved', () => {
    it('should return all approved entries', async () => {
      const mockEntries = [
        createMockWaitlistEntry({ email: 'test1@example.com' }),
        createMockWaitlistEntry({ email: 'test2@example.com' }),
      ];
      mockConnection.executeQuery.mockResolvedValue(mockEntries.map((entry) => ({ entry })));

      const result = await repository.getAllApproved();

      expect(result).toHaveLength(2);
      expect(result).toEqual(mockEntries);
      expect(mockConnection.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no approved entries', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getAllApproved();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getAllApproved()).rejects.toThrow(DatabaseError);
    });
  });

  describe('getApprovedCount', () => {
    it('should return count of approved entries', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ count: 5 }]);

      const result = await repository.getApprovedCount();

      expect(result).toBe(5);
      expect(mockConnection.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should return 0 when no approved entries', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getApprovedCount();

      expect(result).toBe(0);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getApprovedCount()).rejects.toThrow(DatabaseError);
    });
  });

  describe('initializeSchema', () => {
    it('should create constraints and indexes successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.initializeSchema();

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(3);
      expect(mockConnection.executeWrite).toHaveBeenNthCalledWith(1, expect.stringContaining('CREATE CONSTRAINT waitlist_email_unique'));
      expect(mockConnection.executeWrite).toHaveBeenNthCalledWith(2, expect.stringContaining('CREATE INDEX waitlist_status'));
      expect(mockConnection.executeWrite).toHaveBeenNthCalledWith(3, expect.stringContaining('CREATE INDEX waitlist_email_status'));
    });

    it('should handle schema initialization errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockConnection.executeWrite.mockRejectedValue(new Error('Constraint already exists'));

      // Should not throw
      await expect(repository.initializeSchema()).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('Waitlist schema initialization warning:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('seedInitialEmails', () => {
    it('should seed initial emails when they do not exist', async () => {
      const mockEntry = createMockWaitlistEntry();

      jest.spyOn(repository, 'getByEmail').mockResolvedValue(null);
      jest.spyOn(repository, 'addApprovedEmail').mockResolvedValue(mockEntry);

      await repository.seedInitialEmails();

      expect(repository.getByEmail).toHaveBeenCalledTimes(3);
      expect(repository.addApprovedEmail).toHaveBeenCalledTimes(3);
      expect(repository.addApprovedEmail).toHaveBeenCalledWith('dewang@theingenuity.co', 'Founder - Primary tester');
      expect(repository.addApprovedEmail).toHaveBeenCalledWith('rudra@theingenuity.co', 'Team member - Alpha tester');
      expect(repository.addApprovedEmail).toHaveBeenCalledWith('prashant@theingenuity.co', 'Team member - Alpha tester');
    });

    it('should skip existing emails', async () => {
      const mockEntry = createMockWaitlistEntry();

      jest.spyOn(repository, 'getByEmail').mockResolvedValue(mockEntry);
      jest.spyOn(repository, 'addApprovedEmail').mockResolvedValue(mockEntry);

      await repository.seedInitialEmails();

      expect(repository.getByEmail).toHaveBeenCalledTimes(3);
      expect(repository.getByEmail).toHaveBeenCalledWith('dewang@theingenuity.co');
      expect(repository.getByEmail).toHaveBeenCalledWith('rudra@theingenuity.co');
      expect(repository.getByEmail).toHaveBeenCalledWith('prashant@theingenuity.co');
      expect(repository.addApprovedEmail).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and continue with other emails', async () => {
      const mockEntry = createMockWaitlistEntry();

      jest
        .spyOn(repository, 'getByEmail')
        .mockResolvedValueOnce(null) // First email doesn't exist
        .mockRejectedValueOnce(new Error('Database error')) // Second email fails
        .mockResolvedValueOnce(null); // Third email doesn't exist

      jest.spyOn(repository, 'addApprovedEmail').mockResolvedValue(mockEntry);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await repository.seedInitialEmails();

      // Should continue processing other emails despite one failure
      expect(repository.getByEmail).toHaveBeenCalledTimes(3);
      expect(repository.addApprovedEmail).toHaveBeenCalledTimes(2); // Only called for successful cases
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to add email rudra@theingenuity.co:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('private helper methods', () => {
    describe('normalizeEmail', () => {
      it('should convert to lowercase and trim whitespace', () => {
        const repo = repository as unknown as { normalizeEmail: (email: string) => string };

        expect(repo.normalizeEmail('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
        expect(repo.normalizeEmail('MixedCase@Domain.org')).toBe('mixedcase@domain.org');
        expect(repo.normalizeEmail('already@lowercase.com')).toBe('already@lowercase.com');
      });
    });

    describe('isValidEmail', () => {
      it('should validate correct email formats', () => {
        const repo = repository as unknown as { isValidEmail: (email: string) => boolean };

        expect(repo.isValidEmail('test@example.com')).toBe(true);
        expect(repo.isValidEmail('user.name@domain.org')).toBe(true);
        expect(repo.isValidEmail('user+tag@domain.co.uk')).toBe(true);
        expect(repo.isValidEmail('123@456.789')).toBe(true);
      });

      it('should reject invalid email formats', () => {
        const repo = repository as unknown as { isValidEmail: (email: string) => boolean };

        expect(repo.isValidEmail('invalid-email')).toBe(false);
        expect(repo.isValidEmail('@example.com')).toBe(false);
        expect(repo.isValidEmail('test@')).toBe(false);
        expect(repo.isValidEmail('test.example.com')).toBe(false);
        expect(repo.isValidEmail('')).toBe(false);
        expect(repo.isValidEmail('test@.com')).toBe(false);
        expect(repo.isValidEmail('test@example.')).toBe(false);
        expect(repo.isValidEmail('test@@example.com')).toBe(false);
        expect(repo.isValidEmail('test @example.com')).toBe(false);
      });
    });
  });

  describe('error handling scenarios', () => {
    it('should handle connection timeouts', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('connection timeout'));

      await expect(repository.checkApproval('test@example.com')).rejects.toThrow(DatabaseError);
    });

    it('should handle constraint violations', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('unique constraint violation'));

      await expect(repository.addApprovedEmail('test@example.com')).rejects.toThrow(ConflictError);
    });

    it('should handle network errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('network error'));

      await expect(repository.getAllApproved()).rejects.toThrow(DatabaseError);
    });

    it('should handle query syntax errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('syntax error in query'));

      await expect(repository.getApprovedCount()).rejects.toThrow(DatabaseError);
    });
  });

  describe('edge cases', () => {
    it('should handle emails with special characters', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ isApproved: true }]);

      await repository.checkApproval('user+test@example-domain.co.uk');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.any(String), {
        email: 'user+test@example-domain.co.uk',
      });
    });

    it('should handle very long valid emails', async () => {
      const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com';
      mockConnection.executeQuery.mockResolvedValue([{ isApproved: true }]);

      const result = await repository.checkApproval(longEmail);

      expect(result).toBe(true);
    });

    it('should handle international domain names', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ isApproved: true }]);

      await repository.checkApproval('test@münchen.de');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.any(String), {
        email: 'test@münchen.de',
      });
    });

    it('should handle getByEmail with special characters in result', async () => {
      const mockEntry = createMockWaitlistEntry({
        email: 'test+special@example.com',
        notes: 'Notes with "quotes" and special chars: äöü',
      });
      mockConnection.executeQuery.mockResolvedValue([{ entry: mockEntry }]);

      const result = await repository.getByEmail('test+special@example.com');

      expect(result).toEqual(mockEntry);
    });

    it('should handle empty notes gracefully', async () => {
      const mockEntry = createMockWaitlistEntry({ notes: undefined });
      mockConnection.executeWrite.mockResolvedValue([{ entry: mockEntry }]);

      await repository.addApprovedEmail('test@example.com', '');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          notes: null,
        })
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete workflow: check -> add -> verify', async () => {
      const email = 'newuser@example.com';
      const mockEntry = createMockWaitlistEntry({ email });

      // First check should return false (not approved)
      mockConnection.executeQuery
        .mockResolvedValueOnce([]) // checkApproval
        .mockResolvedValueOnce([{ entry: mockEntry }]); // getByEmail verification

      // Add should succeed
      mockConnection.executeWrite.mockResolvedValue([{ entry: mockEntry }]);

      // Simulate workflow
      const isApproved = await repository.checkApproval(email);
      expect(isApproved).toBe(false);

      const added = await repository.addApprovedEmail(email, 'New user');
      expect(added).toEqual(mockEntry);

      const retrieved = await repository.getByEmail(email);
      expect(retrieved).toEqual(mockEntry);
    });

    it('should handle bulk operations', async () => {
      const emails = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
      const mockEntries = emails.map((email) => createMockWaitlistEntry({ email }));

      mockConnection.executeQuery.mockResolvedValue(mockEntries.map((entry) => ({ entry })));

      const result = await repository.getAllApproved();

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.email)).toEqual(emails);
    });
  });
});
