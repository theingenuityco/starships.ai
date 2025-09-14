/**
 * UserRepository Unit Tests - Updated for Layered Architecture
 */

import 'reflect-metadata';
import { ConflictError, DatabaseError, NotFoundError } from '@starships/errors';
import { UserModel } from '@starships/protocol';
import { RepositoryTestHelper } from '../../tests/repository-test-helper';

// Mock nanoid for predictable IDs
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'generated-test-id-123'),
}));

// Mock the database connection
jest.mock('@/helpers/database', () => ({
  getConnection: jest.fn(),
}));

import { UserRepository } from '../UserRepository';

// Import real UserEntity and only mock its validation method
import { UserEntity } from '@/entities/UserEntity';

// Mock only the methods that need mocking to avoid validation in tests
jest.spyOn(UserEntity, 'validate').mockResolvedValue(undefined);
jest.spyOn(UserEntity, 'generateUsernameFromEmail').mockImplementation((email: string) => email.split('@')[0]);
describe('UserRepository', () => {
  let repository: UserRepository;
  let testHelper: RepositoryTestHelper;

  beforeEach(() => {
    testHelper = new RepositoryTestHelper();
    repository = new UserRepository();

    // Reset mocks
    testHelper.reset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as unknown as { serviceName: string }).serviceName).toBe('UserRepository');
    });
  });

  describe('findAll', () => {
    it('should return all users ordered by creation date', async () => {
      const mockUsers: UserModel[] = [
        global.createMockUser({ id: 'user-1', email: 'user1@example.com' }),
        global.createMockUser({ id: 'user-2', email: 'user2@example.com' }),
      ];

      testHelper.mockFindQuery(mockUsers, 'u');

      const result = await repository.findAll();

      expect(testHelper.mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (u:User) RETURN u ORDER BY u.createdAt DESC');
      expect(result).toHaveLength(mockUsers.length);
      expect(result[0]).toBeInstanceOf(UserEntity);
      expect(result[0].id).toBe(mockUsers[0].id);
      expect(result[0].email).toBe(mockUsers[0].email);
      expect(result[0].displayName).toBe(mockUsers[0].displayName);
      expect(result[1]).toBeInstanceOf(UserEntity);
      expect(result[1].id).toBe(mockUsers[1].id);
      expect(result[1].email).toBe(mockUsers[1].email);
      expect(result[1].displayName).toBe(mockUsers[1].displayName);
    });

    it('should return empty array when no users found', async () => {
      testHelper.mockFindQuery([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('findById', () => {
    it('should return user by ID', async () => {
      const mockUser = global.createMockUser();
      testHelper.mockFindQuery(mockUser, 'u');

      const result = await repository.findById('user-123');

      expect(testHelper.mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (u:User) WHERE u.id = $id RETURN u', { id: 'user-123' });
      expect(result).toBeInstanceOf(UserEntity);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockUser.id);
      expect(result!.email).toBe(mockUser.email);
      expect(result!.displayName).toBe(mockUser.displayName);
    });

    it('should return null when user not found', async () => {
      testHelper.mockFindQuery(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      const mockUser = global.createMockUser({ email: 'test@example.com' });
      testHelper.mockFindQuery(mockUser, 'u');

      const result = await repository.findByEmail('test@example.com');

      expect(testHelper.mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (u:User) WHERE u.email = $email RETURN u', {
        email: 'test@example.com',
      });
      expect(result).toBeInstanceOf(UserEntity);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockUser.id);
      expect(result!.email).toBe(mockUser.email);
      expect(result!.displayName).toBe(mockUser.displayName);
    });

    it('should return null when email not found', async () => {
      testHelper.mockFindQuery(null);

      const result = await repository.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should return user by username', async () => {
      const mockUser = global.createMockUser({ username: 'testuser' });
      testHelper.mockFindQuery(mockUser, 'u');

      const result = await repository.findByUsername('testuser');

      expect(testHelper.mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (u:User) WHERE u.username = $username RETURN u', {
        username: 'testuser',
      });
      expect(result).toBeInstanceOf(UserEntity);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockUser.id);
      expect(result!.email).toBe(mockUser.email);
      expect(result!.displayName).toBe(mockUser.displayName);
    });
  });

  describe('create', () => {
    it('should create new user with required fields', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        avatar: 'avatar-url',
      };

      const mockTimestamp = new Date().toISOString();
      const createdUser = {
        ...userData,
        id: 'generated-test-id-123',
        createdAt: mockTimestamp,
      };

      testHelper.mockMergeWrite(createdUser);

      const result = await repository.create(userData);

      expect(UserEntity.validate).toHaveBeenCalledWith(userData, 'create');
      expect(result).toBeInstanceOf(UserEntity);
      expect(result).toEqual(
        expect.objectContaining({
          id: 'generated-test-id-123',
          email: 'test@example.com',
          username: 'testuser',
          displayName: 'Test User',
          createdAt: expect.any(String),
        })
      );
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        username: 'testuser',
        // Missing email
      };

      (UserEntity.validate as jest.Mock).mockRejectedValueOnce(new Error('Email is required for user creation'));

      await expect(repository.create(incompleteData as unknown as Omit<UserModel, 'id' | 'createdAt'>)).rejects.toThrow(DatabaseError);
      expect(UserEntity.validate).toHaveBeenCalledWith(incompleteData, 'create');
    });

    it('should handle merge operation for existing email', async () => {
      const userData = {
        username: 'existinguser',
        email: 'updated@example.com',
        displayName: 'Updated Name',
      };

      const existingUser = global.createMockUser({
        username: 'existinguser',
        email: 'updated@example.com',
        displayName: 'Updated Name',
      });

      testHelper.mockMergeWrite(existingUser);

      const result = await repository.create(userData);

      expect(UserEntity.validate).toHaveBeenCalledWith(userData, 'create');
      expect(result.email).toBe('updated@example.com');
      expect(result.displayName).toBe('Updated Name');
    });
  });

  describe('update', () => {
    it('should update user with valid data', async () => {
      const updates = {
        displayName: 'Updated Name',
        avatar: 'new-avatar-url',
      };

      const mockTimestamp = new Date().toISOString();
      const updatedUser = global.createMockUser({
        id: 'user-123',
        ...updates,
        updatedAt: mockTimestamp,
      });

      testHelper.mockUpdateWrite(updatedUser, 'u');

      const result = await repository.update('user-123', updates);

      expect(UserEntity.validate).toHaveBeenCalledWith(updates, 'update');
      expect(result).toBeInstanceOf(UserEntity);
      expect(result).toEqual(expect.objectContaining(updatedUser));
    });

    it('should return existing user when no updates provided', async () => {
      const mockTimestamp = new Date().toISOString();
      const existingUser = global.createMockUser({
        id: 'user-123',
        updatedAt: mockTimestamp,
      });

      testHelper.mockUpdateWrite(existingUser, 'u');

      const result = await repository.update('user-123', {});

      expect(UserEntity.validate).not.toHaveBeenCalled();
      // Even with empty updates, updatedAt is still set, so it uses executeWrite
      expect(testHelper.mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET u.updatedAt = $updatedAt'),
        expect.objectContaining({ id: 'user-123', updatedAt: expect.any(String) })
      );
      expect(result).toEqual(expect.objectContaining(existingUser));
    });

    it('should throw NotFoundError when user does not exist', async () => {
      testHelper.mockUpdateWrite(null);

      await expect(repository.update('non-existent', { displayName: 'New Name' })).rejects.toThrow(NotFoundError);
      expect(UserEntity.validate).toHaveBeenCalledWith({ displayName: 'New Name' }, 'update');
    });

    it('should filter out protected fields from updates', async () => {
      const updates = {
        id: 'should-be-ignored',
        createdAt: 'should-be-ignored',
        displayName: 'Valid Update',
      };

      const updatedUser = global.createMockUser({
        id: 'user-123',
        displayName: 'Valid Update',
      });
      testHelper.mockUpdateWrite(updatedUser, 'u');

      const result = await repository.update('user-123', updates);

      const query = testHelper.mockConnection.executeWrite.mock.calls[0][0];
      const params = testHelper.mockConnection.executeWrite.mock.calls[0][1];

      expect(query).toContain('SET u.displayName = $displayName');
      expect(query).not.toContain('SET u.id =');
      expect(query).not.toContain('SET u.createdAt =');

      expect(params.displayName).toBe('Valid Update');
      expect(params.updatedAt).toBeDefined();
      // The id in params should be the actual user ID, not the ignored one
      expect(params.id).toBe('user-123');
      expect(result).toBeInstanceOf(UserEntity);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(updatedUser.id);
      expect(result!.displayName).toBe(updatedUser.displayName);
    });
  });

  describe('delete', () => {
    it('should delete user successfully', async () => {
      testHelper.mockDeleteWrite(true);

      const result = await repository.delete('user-123');

      expect(testHelper.mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (u:User) WHERE u.id = $id DETACH DELETE u RETURN count(u) as deletedCount',
        { id: 'user-123' }
      );
      expect(result).toBe(true);
    });

    it('should return false when user does not exist', async () => {
      testHelper.mockDeleteWrite(false);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('findByStripeCustomerId', () => {
    it('should return user by Stripe customer ID', async () => {
      const mockUser = global.createMockUser({ stripeCustomerId: 'cus_123' });
      testHelper.mockFindQuery(mockUser, 'user');

      const result = await repository.findByStripeCustomerId('cus_123');

      expect(testHelper.mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (user:User {stripeCustomerId: $stripeCustomerId})'),
        { stripeCustomerId: 'cus_123' }
      );
      expect(result).toBeInstanceOf(UserEntity);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockUser.id);
      expect(result!.stripeCustomerId).toBe(mockUser.stripeCustomerId);
    });

    it('should return null when Stripe customer ID not found', async () => {
      testHelper.mockFindQuery(null);

      const result = await repository.findByStripeCustomerId('cus_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateStripeCustomerId', () => {
    it('should update user with Stripe customer ID', async () => {
      testHelper.mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateStripeCustomerId('user-123', 'cus_123');

      expect(testHelper.mockConnection.executeWrite).toHaveBeenCalledWith(expect.stringContaining('MATCH (user:User {id: $userId})'), {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
      });
    });

    it('should validate required parameters', async () => {
      await expect(repository.updateStripeCustomerId('', 'cus_123')).rejects.toThrow(DatabaseError);
      await expect(repository.updateStripeCustomerId('user-123', '')).rejects.toThrow(DatabaseError);
    });
  });

  describe('error handling', () => {
    it('should handle database errors', async () => {
      testHelper.mockDatabaseError();

      await expect(repository.findById('user-123')).rejects.toThrow(DatabaseError);
      expect(testHelper.mockConnection.executeQuery).toHaveBeenCalled();
    });

    it('should handle unique constraint violations', async () => {
      testHelper.mockConstraintError();

      const duplicateUser = {
        username: 'existinguser',
        email: 'existing@example.com',
      };

      await expect(repository.create(duplicateUser)).rejects.toThrow(ConflictError);
      expect(testHelper.mockConnection.executeWrite).toHaveBeenCalled();
    });

    it('should handle query timeout errors', async () => {
      const timeoutError = new Error('QueryTimeout');
      testHelper.mockConnection.executeQuery.mockRejectedValue(timeoutError);

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
      expect(testHelper.mockConnection.executeQuery).toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle user registration flow', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@example.com',
        displayName: 'New User',
      };

      testHelper.mockFindQuery(null, 'u');

      const mockTimestamp = new Date().toISOString();
      const createdUser = {
        ...userData,
        id: 'generated-test-id-123',
        createdAt: mockTimestamp,
      };
      testHelper.mockMergeWrite(createdUser);

      const existingUser = await repository.findByEmail(userData.email);
      expect(existingUser).toBeNull();

      const newUser = await repository.create(userData);
      expect(newUser).toBeInstanceOf(UserEntity);
      expect(newUser).toEqual(
        expect.objectContaining({
          id: 'generated-test-id-123',
          email: 'new@example.com',
          username: 'newuser',
          displayName: 'New User',
          createdAt: expect.any(String),
        })
      );
    });

    it('should handle user profile update flow', async () => {
      const userId = 'user-123';
      const updates = {
        displayName: 'Updated Name',
        avatar: 'new-avatar-url',
      };

      const mockTimestamp = new Date().toISOString();
      const updatedUser = {
        id: userId,
        ...updates,
        updatedAt: mockTimestamp,
      };

      testHelper.mockUpdateWrite(updatedUser, 'u');

      const result = await repository.update(userId, updates);

      expect(result).toBeInstanceOf(UserEntity);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(updatedUser.id);
      expect(result!.displayName).toBe(updatedUser.displayName);
    });

    it('should handle user deletion flow', async () => {
      const userId = 'user-to-delete';

      testHelper.mockDeleteWrite(true);

      const deleted = await repository.delete(userId);

      expect(deleted).toBe(true);
      expect(testHelper.mockConnection.executeWrite).toHaveBeenCalledWith(expect.stringContaining('DETACH DELETE'), { id: userId });
    });
  });
});
