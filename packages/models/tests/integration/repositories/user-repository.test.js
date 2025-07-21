"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const UserRepository_1 = require("@/repositories/UserRepository");
const connection_1 = require("@/connection");
describe('UserRepository Integration Tests', () => {
    let userRepository;
    let connection;
    beforeEach(async () => {
        connection = (0, connection_1.getConnection)();
        userRepository = new UserRepository_1.UserRepository();
        // Clean up any existing test data
        await connection.executeWrite('MATCH (n) DETACH DELETE n');
    });
    describe('create()', () => {
        it('should create user with all fields', async () => {
            const userData = {
                kindeId: 'kinde_123456',
                username: 'testuser',
                email: 'test@example.com',
                displayName: 'Test User',
                avatar: 'https://example.com/avatar.jpg'
            };
            const result = await userRepository.create(userData);
            expect(result.id).toBeDefined();
            expect(result.id).toMatch(/^test-uuid-\d+$/);
            expect(result.kindeId).toBe(userData.kindeId);
            expect(result.username).toBe(userData.username);
            expect(result.email).toBe(userData.email);
            expect(result.displayName).toBe(userData.displayName);
            expect(result.avatar).toBe(userData.avatar);
            expect(result.createdAt).toBeDefined();
            // Verify it was actually saved to the database
            const savedUser = await userRepository.findById(result.id);
            expect(savedUser).not.toBeNull();
            expect(savedUser?.username).toBe(userData.username);
        });
        it('should create user with minimal required fields', async () => {
            const userData = {
                username: 'minimaluser'
            };
            const result = await userRepository.create(userData);
            expect(result.id).toBeDefined();
            expect(result.username).toBe(userData.username);
            expect(result.kindeId).toBeUndefined();
            expect(result.email).toBeUndefined();
            expect(result.displayName).toBeUndefined();
            expect(result.avatar).toBeUndefined();
            expect(result.createdAt).toBeDefined();
        });
        it('should create multiple users with unique IDs', async () => {
            const user1Data = {
                username: 'user1',
                email: 'user1@example.com'
            };
            const user2Data = {
                username: 'user2',
                email: 'user2@example.com'
            };
            const user1 = await userRepository.create(user1Data);
            const user2 = await userRepository.create(user2Data);
            expect(user1.id).not.toBe(user2.id);
            expect(user1.username).toBe(user1Data.username);
            expect(user2.username).toBe(user2Data.username);
        });
    });
    describe('findById()', () => {
        it('should return user when found', async () => {
            const userData = {
                username: 'findableuser',
                email: 'findable@example.com',
                displayName: 'Findable User'
            };
            const createdUser = await userRepository.create(userData);
            const foundUser = await userRepository.findById(createdUser.id);
            expect(foundUser).not.toBeNull();
            expect(foundUser?.id).toBe(createdUser.id);
            expect(foundUser?.username).toBe(userData.username);
            expect(foundUser?.email).toBe(userData.email);
        });
        it('should return null when user not found', async () => {
            const result = await userRepository.findById('nonexistent-id');
            expect(result).toBeNull();
        });
    });
    describe('findByEmail()', () => {
        it('should return user when found by email', async () => {
            const userData = {
                username: 'emailuser',
                email: 'unique@example.com',
                displayName: 'Email User'
            };
            const createdUser = await userRepository.create(userData);
            const foundUser = await userRepository.findByEmail(userData.email);
            expect(foundUser).not.toBeNull();
            expect(foundUser?.id).toBe(createdUser.id);
            expect(foundUser?.email).toBe(userData.email);
            expect(foundUser?.username).toBe(userData.username);
        });
        it('should return null when email not found', async () => {
            const result = await userRepository.findByEmail('nonexistent@example.com');
            expect(result).toBeNull();
        });
        it('should handle case sensitivity correctly', async () => {
            const userData = {
                username: 'caseuser',
                email: 'CaseSensitive@Example.Com'
            };
            await userRepository.create(userData);
            // Should find with exact case
            const exactMatch = await userRepository.findByEmail('CaseSensitive@Example.Com');
            expect(exactMatch).not.toBeNull();
            // Should not find with different case (Neo4j is case-sensitive by default)
            const differentCase = await userRepository.findByEmail('casesensitive@example.com');
            expect(differentCase).toBeNull();
        });
    });
    describe('findByUsername()', () => {
        it('should return user when found by username', async () => {
            const userData = {
                username: 'uniqueusername',
                email: 'username@example.com',
                displayName: 'Username User'
            };
            const createdUser = await userRepository.create(userData);
            const foundUser = await userRepository.findByUsername(userData.username);
            expect(foundUser).not.toBeNull();
            expect(foundUser?.id).toBe(createdUser.id);
            expect(foundUser?.username).toBe(userData.username);
            expect(foundUser?.email).toBe(userData.email);
        });
        it('should return null when username not found', async () => {
            const result = await userRepository.findByUsername('nonexistentuser');
            expect(result).toBeNull();
        });
        it('should handle case sensitivity correctly', async () => {
            const userData = {
                username: 'CaseUser',
                email: 'case@example.com'
            };
            await userRepository.create(userData);
            // Should find with exact case
            const exactMatch = await userRepository.findByUsername('CaseUser');
            expect(exactMatch).not.toBeNull();
            // Should not find with different case
            const differentCase = await userRepository.findByUsername('caseuser');
            expect(differentCase).toBeNull();
        });
    });
    describe('findByKindeId()', () => {
        it('should return user when found by kindeId', async () => {
            const userData = {
                kindeId: 'kinde_unique_123',
                username: 'kindeuser',
                email: 'kinde@example.com'
            };
            const createdUser = await userRepository.create(userData);
            const foundUser = await userRepository.findByKindeId(userData.kindeId);
            expect(foundUser).not.toBeNull();
            expect(foundUser?.id).toBe(createdUser.id);
            expect(foundUser?.kindeId).toBe(userData.kindeId);
            expect(foundUser?.username).toBe(userData.username);
        });
        it('should return null when kindeId not found', async () => {
            const result = await userRepository.findByKindeId('kinde_nonexistent');
            expect(result).toBeNull();
        });
        it('should return null when searching for undefined kindeId', async () => {
            // Create user without kindeId
            await userRepository.create({
                username: 'nokinde',
                email: 'nokinde@example.com'
            });
            const result = await userRepository.findByKindeId('kinde_anything');
            expect(result).toBeNull();
        });
    });
    describe('findAll()', () => {
        it('should return all users ordered by creation date', async () => {
            const user1Data = {
                username: 'first_user',
                email: 'first@example.com'
            };
            const user2Data = {
                username: 'second_user',
                email: 'second@example.com'
            };
            const user1 = await userRepository.create(user1Data);
            // Small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 10));
            const user2 = await userRepository.create(user2Data);
            const allUsers = await userRepository.findAll();
            expect(allUsers).toHaveLength(2);
            // Should be ordered by createdAt DESC (newest first)
            expect(allUsers[0].id).toBe(user2.id);
            expect(allUsers[1].id).toBe(user1.id);
        });
        it('should return empty array when no users exist', async () => {
            const result = await userRepository.findAll();
            expect(result).toEqual([]);
        });
    });
    describe('update()', () => {
        it('should update user properties', async () => {
            const userData = {
                username: 'originaluser',
                email: 'original@example.com',
                displayName: 'Original Name'
            };
            const createdUser = await userRepository.create(userData);
            const updates = {
                displayName: 'Updated Name',
                avatar: 'https://newavatar.com/pic.jpg'
            };
            const updatedUser = await userRepository.update(createdUser.id, updates);
            expect(updatedUser).not.toBeNull();
            expect(updatedUser?.displayName).toBe(updates.displayName);
            expect(updatedUser?.avatar).toBe(updates.avatar);
            expect(updatedUser?.username).toBe(userData.username); // Should remain unchanged
            expect(updatedUser?.email).toBe(userData.email); // Should remain unchanged
            expect(updatedUser?.id).toBe(createdUser.id);
        });
        it('should not update when no valid fields provided', async () => {
            const userData = {
                username: 'nochange',
                email: 'nochange@example.com'
            };
            const createdUser = await userRepository.create(userData);
            // Try to update with only restricted fields
            const updatedUser = await userRepository.update(createdUser.id, {
                id: 'new-id', // Should be ignored
                createdAt: 'new-date' // Should be ignored
            });
            expect(updatedUser).not.toBeNull();
            expect(updatedUser?.id).toBe(createdUser.id); // Should remain unchanged
            expect(updatedUser?.username).toBe(userData.username);
        });
        it('should return null when updating non-existent user', async () => {
            const result = await userRepository.update('nonexistent-id', {
                displayName: 'Updated Name'
            });
            expect(result).toBeNull();
        });
    });
    describe('delete()', () => {
        it('should delete user and return true on success', async () => {
            const userData = {
                username: 'deletableuser',
                email: 'deletable@example.com'
            };
            const createdUser = await userRepository.create(userData);
            const deleteResult = await userRepository.delete(createdUser.id);
            expect(deleteResult).toBe(true);
            // Verify it was actually deleted
            const foundUser = await userRepository.findById(createdUser.id);
            expect(foundUser).toBeNull();
        });
        it('should return false when user not found', async () => {
            const result = await userRepository.delete('nonexistent-id');
            expect(result).toBe(false);
        });
    });
    describe('joinChannel()', () => {
        it('should create relationship between user and channel', async () => {
            const user = await userRepository.create({
                username: 'channeluser',
                email: 'channel@example.com'
            });
            // Create a channel directly for testing
            const channelId = 'test-channel-1';
            await connection.executeWrite('CREATE (c:Channel {id: $id, name: "Test Channel", type: "text"})', { id: channelId });
            await userRepository.joinChannel(user.id, channelId, 'member');
            // Verify the relationship was created
            const relationship = await connection.executeQuery(`MATCH (u:User {id: $userId})-[r:ACTIVE_IN]->(c:Channel {id: $channelId})
         RETURN r`, { userId: user.id, channelId });
            expect(relationship).toHaveLength(1);
            expect(relationship[0].r.properties.role).toBe('member');
            expect(relationship[0].r.properties.joinedAt).toBeDefined();
        });
        it('should create relationship without role', async () => {
            const user = await userRepository.create({
                username: 'noroleuser',
                email: 'norole@example.com'
            });
            const channelId = 'test-channel-2';
            await connection.executeWrite('CREATE (c:Channel {id: $id, name: "Test Channel 2", type: "text"})', { id: channelId });
            await userRepository.joinChannel(user.id, channelId);
            // Verify the relationship was created
            const relationship = await connection.executeQuery(`MATCH (u:User {id: $userId})-[r:ACTIVE_IN]->(c:Channel {id: $channelId})
         RETURN r`, { userId: user.id, channelId });
            expect(relationship).toHaveLength(1);
            expect(relationship[0].r.properties.role).toBeUndefined();
            expect(relationship[0].r.properties.joinedAt).toBeDefined();
        });
        it('should update existing relationship', async () => {
            const user = await userRepository.create({
                username: 'updateuser',
                email: 'update@example.com'
            });
            const channelId = 'test-channel-3';
            await connection.executeWrite('CREATE (c:Channel {id: $id, name: "Test Channel 3", type: "text"})', { id: channelId });
            // Join with initial role
            await userRepository.joinChannel(user.id, channelId, 'member');
            // Update role
            await userRepository.joinChannel(user.id, channelId, 'admin');
            // Verify the relationship was updated
            const relationship = await connection.executeQuery(`MATCH (u:User {id: $userId})-[r:ACTIVE_IN]->(c:Channel {id: $channelId})
         RETURN r`, { userId: user.id, channelId });
            expect(relationship).toHaveLength(1);
            expect(relationship[0].r.properties.role).toBe('admin');
        });
    });
    describe('database constraints', () => {
        it('should enforce unique user IDs', async () => {
            const user = await userRepository.create({
                username: 'uniqueuser',
                email: 'unique@example.com'
            });
            // Try to create a user with the same ID directly via connection
            await expect(connection.executeWrite('CREATE (u:User {id: $id, username: "duplicate", email: "dup@example.com"})', { id: user.id })).rejects.toThrow();
        });
    });
    describe('edge cases', () => {
        it('should handle empty string values correctly', async () => {
            const userData = {
                username: 'emptyuser',
                email: '',
                displayName: '',
                avatar: ''
            };
            const result = await userRepository.create(userData);
            expect(result.username).toBe('emptyuser');
            expect(result.email).toBe('');
            expect(result.displayName).toBe('');
            expect(result.avatar).toBe('');
        });
        it('should handle special characters in username', async () => {
            const userData = {
                username: 'user_with-special.chars@123',
                email: 'special@example.com'
            };
            const result = await userRepository.create(userData);
            expect(result.username).toBe(userData.username);
            // Should be able to find by username
            const foundUser = await userRepository.findByUsername(userData.username);
            expect(foundUser).not.toBeNull();
            expect(foundUser?.id).toBe(result.id);
        });
        it('should handle very long field values', async () => {
            const longString = 'a'.repeat(1000);
            const userData = {
                username: 'longuser',
                email: 'long@example.com',
                displayName: longString,
                avatar: `https://example.com/${longString}.jpg`
            };
            const result = await userRepository.create(userData);
            expect(result.displayName).toBe(longString);
            expect(result.avatar).toBe(`https://example.com/${longString}.jpg`);
        });
    });
});
//# sourceMappingURL=user-repository.test.js.map