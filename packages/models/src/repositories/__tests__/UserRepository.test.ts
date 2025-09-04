/**
 * UserRepository Unit Tests
 */

import { UserRepository } from '../UserRepository';
import { ValidationError, NotFoundError } from '@starships/errors';
import { UserModel } from '@starships/protocol';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(() => ({
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  })),
}));

import { getConnection } from '../../helpers/database';

describe('UserRepository', () => {
  let repository: UserRepository;
  let mockConnection: any;

  beforeEach(() => {
    repository = new UserRepository();
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as any).serviceName).toBe('UserRepository');
    });
  });

  describe('findAll', () => {
    it('should return all users ordered by creation date', async () => {
      const mockUsers: UserModel[] = [
        global.createMockUser({ id: 'user-1', email: 'user1@example.com' }),
        global.createMockUser({ id: 'user-2', email: 'user2@example.com' }),
      ];

      mockConnection.executeQuery.mockResolvedValue([{ u: mockUsers[0] }, { u: mockUsers[1] }]);

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (u:User) RETURN u ORDER BY u.createdAt DESC'
      );
      expect(result).toEqual(mockUsers);
    });

    it('should return empty array when no users found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findAll()).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should return user by ID', async () => {
      const mockUser = global.createMockUser();
      mockConnection.executeQuery.mockResolvedValue([{ u: mockUser }]);

      const result = await repository.findById('user-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (u:User) WHERE u.id = $id RETURN u',
        { id: 'user-123' }
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      const mockUser = global.createMockUser({ email: 'test@example.com' });
      mockConnection.executeQuery.mockResolvedValue([{ u: mockUser }]);

      const result = await repository.findByEmail('test@example.com');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (u:User) WHERE u.email = $email RETURN u',
        { email: 'test@example.com' }
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null when email not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should return user by username', async () => {
      const mockUser = global.createMockUser({ username: 'testuser' });
      mockConnection.executeQuery.mockResolvedValue([{ u: mockUser }]);

      const result = await repository.findByUsername('testuser');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (u:User) WHERE u.username = $username RETURN u',
        { username: 'testuser' }
      );
      expect(result).toEqual(mockUser);
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

      const createdUser = {
        ...userData,
        id: 'test-uuid-123',
        createdAt: expect.any(String),
      };

      mockConnection.executeWrite.mockResolvedValue([{ n: createdUser }]);

      const result = await repository.create(userData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (n:User'),
        expect.objectContaining({
          match: expect.objectContaining({
            email: 'test@example.com',
          }),
          create: expect.objectContaining({
            email: 'test@example.com',
            username: 'testuser',
            displayName: 'Test User',
            avatar: 'avatar-url',
          }),
          update: expect.objectContaining({
            email: 'test@example.com',
            username: 'testuser',
            displayName: 'Test User',
            avatar: 'avatar-url',
          }),
        })
      );
      expect(result).toEqual(createdUser);
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        username: 'testuser',
        // Missing email
      };

      await expect(repository.create(incompleteData as any)).rejects.toThrow(ValidationError);
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

      mockConnection.executeWrite.mockResolvedValue([{ n: existingUser }]);

      const result = await repository.create(userData);

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

      const updatedUser = global.createMockUser({
        id: 'user-123',
        ...updates,
      });

      mockConnection.executeWrite.mockResolvedValue([{ u: updatedUser }]);

      const result = await repository.update('user-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (u:User) WHERE u.id = $id'),
        expect.objectContaining({
          id: 'user-123',
          displayName: 'Updated Name',
          avatar: 'new-avatar-url',
        })
      );
      expect(result).toEqual(updatedUser);
    });

    it('should return existing user when no updates provided', async () => {
      const existingUser = global.createMockUser({ id: 'user-123' });
      jest.spyOn(repository, 'findById').mockResolvedValue(existingUser);

      const result = await repository.update('user-123', {});

      expect(repository.findById).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(existingUser);
    });

    it('should throw NotFoundError when user does not exist', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await expect(repository.update('non-existent', { displayName: 'New Name' })).rejects.toThrow(
        NotFoundError
      );
    });

    it('should filter out protected fields from updates', async () => {
      const updates = {
        id: 'should-be-ignored',
        createdAt: 'should-be-ignored',
        displayName: 'Valid Update',
      };

      const updatedUser = global.createMockUser();
      mockConnection.executeWrite.mockResolvedValue([{ u: updatedUser }]);

      await repository.update('user-123', updates);

      const query = mockConnection.executeWrite.mock.calls[0][0];
      // Check that the SET clause doesn't include protected fields, but WHERE clause can contain u.id
      expect(query).toContain('SET u.displayName = $displayName');
      expect(query).not.toContain('SET u.id =');
      expect(query).not.toContain('SET u.createdAt =');
      expect(query).not.toContain('u.id = $id, u.createdAt'); // Ensure SET clause doesn't include these
    });
  });

  describe('delete', () => {
    it('should delete user successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('user-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (u:User) WHERE u.id = $id DETACH DELETE u RETURN count(u) as deletedCount',
        { id: 'user-123' }
      );
      expect(result).toBe(true);
    });

    it('should return false when user does not exist', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('findByStripeCustomerId', () => {
    it('should return user by Stripe customer ID', async () => {
      const mockUser = global.createMockUser({ stripeCustomerId: 'cus_123' });
      mockConnection.executeQuery.mockResolvedValue([{ user: mockUser }]);

      const result = await repository.findByStripeCustomerId('cus_123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (user:User {stripeCustomerId: $stripeCustomerId})'),
        { stripeCustomerId: 'cus_123' }
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null when Stripe customer ID not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByStripeCustomerId('cus_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateStripeCustomerId', () => {
    it('should update user with Stripe customer ID', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateStripeCustomerId('user-123', 'cus_123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (user:User {id: $userId})'),
        { userId: 'user-123', stripeCustomerId: 'cus_123' }
      );
    });

    it('should validate required parameters', async () => {
      await expect(repository.updateStripeCustomerId('', 'cus_123')).rejects.toThrow(
        ValidationError
      );

      await expect(repository.updateStripeCustomerId('user-123', '')).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Connection failed'));

      await expect(repository.findById('user-123')).rejects.toThrow();
    });

    it('should handle constraint violations during create', async () => {
      const error = new Error('unique constraint violation');
      mockConnection.executeWrite.mockRejectedValue(error);

      const userData = {
        username: 'testuser',
        email: 'test@example.com',
      };

      await expect(repository.create(userData)).rejects.toThrow();
    });

    it('should handle query timeout errors', async () => {
      const timeoutError = new Error('Query timeout');
      mockConnection.executeQuery.mockRejectedValue(timeoutError);

      await expect(repository.findAll()).rejects.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle user registration flow', async () => {
      const userData = {
        username: 'oauthuser',
        email: 'oauth@example.com',
        displayName: 'OAuth User',
      };

      // First check if user exists
      mockConnection.executeQuery.mockResolvedValueOnce([]);

      // Then create user
      const createdUser = global.createMockUser(userData);
      mockConnection.executeWrite.mockResolvedValue([{ n: createdUser }]);

      const existingUser = await repository.findByEmail(userData.email);
      expect(existingUser).toBeNull();

      const newUser = await repository.create(userData);
      expect(newUser.username).toBe(userData.username);
      expect(newUser.email).toBe(userData.email);
    });

    it('should handle user profile update flow', async () => {
      const userId = 'user-123';
      const updates = {
        displayName: 'Updated Display Name',
        avatar: 'https://example.com/new-avatar.jpg',
      };

      const updatedUser = global.createMockUser({
        id: userId,
        ...updates,
      });

      mockConnection.executeWrite.mockResolvedValue([{ u: updatedUser }]);

      const result = await repository.update(userId, updates);

      expect(result?.displayName).toBe(updates.displayName);
      expect(result?.avatar).toBe(updates.avatar);
    });

    it('should handle user deletion with cascade', async () => {
      const userId = 'user-to-delete';

      // Mock successful deletion (DETACH DELETE handles cascading)
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const success = await repository.delete(userId);

      expect(success).toBe(true);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        { id: userId }
      );
    });
  });
});
