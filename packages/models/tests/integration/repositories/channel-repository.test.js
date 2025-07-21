"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ChannelRepository_1 = require("@/repositories/ChannelRepository");
const connection_1 = require("@/connection");
describe('ChannelRepository Integration Tests', () => {
    let channelRepository;
    let connection;
    beforeEach(async () => {
        connection = (0, connection_1.getConnection)();
        channelRepository = new ChannelRepository_1.ChannelRepository();
        // Clean up any existing test data
        await connection.executeWrite('MATCH (n) DETACH DELETE n');
    });
    describe('create()', () => {
        it('should create channel with all fields', async () => {
            const channelData = {
                name: 'general',
                guildId: 'guild-123',
                type: 'text'
            };
            const result = await channelRepository.create(channelData);
            expect(result.id).toBeDefined();
            expect(result.id).toMatch(/^test-uuid-\d+$/);
            expect(result.name).toBe(channelData.name);
            expect(result.guildId).toBe(channelData.guildId);
            expect(result.type).toBe(channelData.type);
            expect(result.createdAt).toBeDefined();
            // Verify it was actually saved to the database
            const savedChannel = await channelRepository.findById(result.id);
            expect(savedChannel).not.toBeNull();
            expect(savedChannel?.name).toBe(channelData.name);
        });
        it('should create channel without guildId (DM channel)', async () => {
            const channelData = {
                name: 'direct-message',
                type: 'dm'
            };
            const result = await channelRepository.create(channelData);
            expect(result.id).toBeDefined();
            expect(result.name).toBe(channelData.name);
            expect(result.guildId).toBeUndefined();
            expect(result.type).toBe(channelData.type);
            expect(result.createdAt).toBeDefined();
        });
        it('should create different channel types', async () => {
            const textChannel = await channelRepository.create({
                name: 'text-channel',
                guildId: 'guild-1',
                type: 'text'
            });
            const voiceChannel = await channelRepository.create({
                name: 'voice-channel',
                guildId: 'guild-1',
                type: 'voice'
            });
            const dmChannel = await channelRepository.create({
                name: 'dm-channel',
                type: 'dm'
            });
            expect(textChannel.type).toBe('text');
            expect(voiceChannel.type).toBe('voice');
            expect(dmChannel.type).toBe('dm');
        });
        it('should create multiple channels with unique IDs', async () => {
            const channel1Data = {
                name: 'channel-1',
                guildId: 'guild-1',
                type: 'text'
            };
            const channel2Data = {
                name: 'channel-2',
                guildId: 'guild-1',
                type: 'voice'
            };
            const channel1 = await channelRepository.create(channel1Data);
            const channel2 = await channelRepository.create(channel2Data);
            expect(channel1.id).not.toBe(channel2.id);
            expect(channel1.name).toBe(channel1Data.name);
            expect(channel2.name).toBe(channel2Data.name);
        });
    });
    describe('findById()', () => {
        it('should return channel when found', async () => {
            const channelData = {
                name: 'findable-channel',
                guildId: 'guild-findable',
                type: 'text'
            };
            const createdChannel = await channelRepository.create(channelData);
            const foundChannel = await channelRepository.findById(createdChannel.id);
            expect(foundChannel).not.toBeNull();
            expect(foundChannel?.id).toBe(createdChannel.id);
            expect(foundChannel?.name).toBe(channelData.name);
            expect(foundChannel?.guildId).toBe(channelData.guildId);
            expect(foundChannel?.type).toBe(channelData.type);
        });
        it('should return null when channel not found', async () => {
            const result = await channelRepository.findById('nonexistent-id');
            expect(result).toBeNull();
        });
    });
    describe('findByGuild()', () => {
        it('should return channels filtered by guild', async () => {
            const guild1Id = 'guild-1';
            const guild2Id = 'guild-2';
            // Create channels for guild 1
            const guild1Channel1 = await channelRepository.create({
                name: 'general',
                guildId: guild1Id,
                type: 'text'
            });
            const guild1Channel2 = await channelRepository.create({
                name: 'voice-1',
                guildId: guild1Id,
                type: 'voice'
            });
            // Create channel for guild 2
            const guild2Channel = await channelRepository.create({
                name: 'guild2-general',
                guildId: guild2Id,
                type: 'text'
            });
            // Create DM channel (no guild)
            await channelRepository.create({
                name: 'dm-channel',
                type: 'dm'
            });
            const guild1Channels = await channelRepository.findByGuild(guild1Id);
            const guild2Channels = await channelRepository.findByGuild(guild2Id);
            expect(guild1Channels).toHaveLength(2);
            expect(guild2Channels).toHaveLength(1);
            expect(guild1Channels.map(c => c.id)).toContain(guild1Channel1.id);
            expect(guild1Channels.map(c => c.id)).toContain(guild1Channel2.id);
            expect(guild2Channels.map(c => c.id)).toContain(guild2Channel.id);
        });
        it('should return empty array when no channels found for guild', async () => {
            const result = await channelRepository.findByGuild('nonexistent-guild');
            expect(result).toEqual([]);
        });
        it('should return channels ordered by creation date DESC', async () => {
            const guildId = 'test-guild';
            const channel1 = await channelRepository.create({
                name: 'first-channel',
                guildId,
                type: 'text'
            });
            // Small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 10));
            const channel2 = await channelRepository.create({
                name: 'second-channel',
                guildId,
                type: 'text'
            });
            const guildChannels = await channelRepository.findByGuild(guildId);
            expect(guildChannels).toHaveLength(2);
            // Should be ordered by createdAt DESC (newest first)
            expect(guildChannels[0].id).toBe(channel2.id);
            expect(guildChannels[1].id).toBe(channel1.id);
        });
    });
    describe('findByType()', () => {
        it('should return channels filtered by type', async () => {
            // Create text channels
            const textChannel1 = await channelRepository.create({
                name: 'text-1',
                guildId: 'guild-1',
                type: 'text'
            });
            const textChannel2 = await channelRepository.create({
                name: 'text-2',
                guildId: 'guild-2',
                type: 'text'
            });
            // Create voice channel
            const voiceChannel = await channelRepository.create({
                name: 'voice-1',
                guildId: 'guild-1',
                type: 'voice'
            });
            // Create DM channel
            const dmChannel = await channelRepository.create({
                name: 'dm-1',
                type: 'dm'
            });
            const textChannels = await channelRepository.findByType('text');
            const voiceChannels = await channelRepository.findByType('voice');
            const dmChannels = await channelRepository.findByType('dm');
            expect(textChannels).toHaveLength(2);
            expect(voiceChannels).toHaveLength(1);
            expect(dmChannels).toHaveLength(1);
            expect(textChannels.map(c => c.id)).toContain(textChannel1.id);
            expect(textChannels.map(c => c.id)).toContain(textChannel2.id);
            expect(voiceChannels.map(c => c.id)).toContain(voiceChannel.id);
            expect(dmChannels.map(c => c.id)).toContain(dmChannel.id);
        });
        it('should return empty array when no channels found for type', async () => {
            const result = await channelRepository.findByType('nonexistent');
            expect(result).toEqual([]);
        });
        it('should handle case sensitivity correctly', async () => {
            await channelRepository.create({
                name: 'test-channel',
                guildId: 'guild-1',
                type: 'text'
            });
            // Should find with exact case
            const exactMatch = await channelRepository.findByType('text');
            expect(exactMatch).toHaveLength(1);
            // Should not find with different case
            const differentCase = await channelRepository.findByType('TEXT');
            expect(differentCase).toHaveLength(0);
        });
    });
    describe('findAll()', () => {
        it('should return all channels ordered by creation date DESC', async () => {
            const channel1 = await channelRepository.create({
                name: 'first',
                guildId: 'guild-1',
                type: 'text'
            });
            // Small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 10));
            const channel2 = await channelRepository.create({
                name: 'second',
                guildId: 'guild-1',
                type: 'voice'
            });
            const allChannels = await channelRepository.findAll();
            expect(allChannels).toHaveLength(2);
            // Should be ordered by createdAt DESC (newest first)
            expect(allChannels[0].id).toBe(channel2.id);
            expect(allChannels[1].id).toBe(channel1.id);
        });
        it('should return empty array when no channels exist', async () => {
            const result = await channelRepository.findAll();
            expect(result).toEqual([]);
        });
    });
    describe('update()', () => {
        it('should update channel properties', async () => {
            const channelData = {
                name: 'original-name',
                guildId: 'original-guild',
                type: 'text'
            };
            const createdChannel = await channelRepository.create(channelData);
            const updates = {
                name: 'updated-name',
                guildId: 'updated-guild',
                type: 'voice'
            };
            const updatedChannel = await channelRepository.update(createdChannel.id, updates);
            expect(updatedChannel).not.toBeNull();
            expect(updatedChannel?.name).toBe(updates.name);
            expect(updatedChannel?.guildId).toBe(updates.guildId);
            expect(updatedChannel?.type).toBe(updates.type);
            expect(updatedChannel?.id).toBe(createdChannel.id);
            expect(updatedChannel?.createdAt).toBe(createdChannel.createdAt); // Should remain unchanged
        });
        it('should not update when no valid fields provided', async () => {
            const channelData = {
                name: 'no-change',
                guildId: 'guild-1',
                type: 'text'
            };
            const createdChannel = await channelRepository.create(channelData);
            // Try to update with only restricted fields
            const updatedChannel = await channelRepository.update(createdChannel.id, {
                id: 'new-id', // Should be ignored
                createdAt: 'new-date' // Should be ignored
            });
            expect(updatedChannel).not.toBeNull();
            expect(updatedChannel?.id).toBe(createdChannel.id); // Should remain unchanged
            expect(updatedChannel?.name).toBe(channelData.name);
            expect(updatedChannel?.createdAt).toBe(createdChannel.createdAt);
        });
        it('should return null when updating non-existent channel', async () => {
            const result = await channelRepository.update('nonexistent-id', {
                name: 'updated-name'
            });
            expect(result).toBeNull();
        });
        it('should update individual fields independently', async () => {
            const channelData = {
                name: 'test-channel',
                guildId: 'guild-1',
                type: 'text'
            };
            const createdChannel = await channelRepository.create(channelData);
            // Update only name
            const nameUpdated = await channelRepository.update(createdChannel.id, {
                name: 'new-name'
            });
            expect(nameUpdated?.name).toBe('new-name');
            expect(nameUpdated?.guildId).toBe(channelData.guildId); // Should remain unchanged
            expect(nameUpdated?.type).toBe(channelData.type); // Should remain unchanged
        });
    });
    describe('delete()', () => {
        it('should delete channel and return true on success', async () => {
            const channelData = {
                name: 'deletable-channel',
                guildId: 'guild-1',
                type: 'text'
            };
            const createdChannel = await channelRepository.create(channelData);
            const deleteResult = await channelRepository.delete(createdChannel.id);
            expect(deleteResult).toBe(true);
            // Verify it was actually deleted
            const foundChannel = await channelRepository.findById(createdChannel.id);
            expect(foundChannel).toBeNull();
        });
        it('should return false when channel not found', async () => {
            const result = await channelRepository.delete('nonexistent-id');
            expect(result).toBe(false);
        });
    });
    describe('database constraints', () => {
        it('should enforce unique channel IDs', async () => {
            const channel = await channelRepository.create({
                name: 'unique-channel',
                guildId: 'guild-1',
                type: 'text'
            });
            // Try to create a channel with the same ID directly via connection
            await expect(connection.executeWrite('CREATE (c:Channel {id: $id, name: "duplicate", type: "voice"})', { id: channel.id })).rejects.toThrow();
        });
    });
    describe('edge cases', () => {
        it('should handle empty string values correctly', async () => {
            const channelData = {
                name: '',
                guildId: '',
                type: 'text'
            };
            const result = await channelRepository.create(channelData);
            expect(result.name).toBe('');
            expect(result.guildId).toBe('');
            expect(result.type).toBe('text');
        });
        it('should handle special characters in name', async () => {
            const channelData = {
                name: 'channel-with_special.chars@123!',
                guildId: 'guild-special',
                type: 'text'
            };
            const result = await channelRepository.create(channelData);
            expect(result.name).toBe(channelData.name);
            // Should be able to find by ID
            const foundChannel = await channelRepository.findById(result.id);
            expect(foundChannel).not.toBeNull();
            expect(foundChannel?.name).toBe(channelData.name);
        });
        it('should handle very long field values', async () => {
            const longString = 'a'.repeat(1000);
            const channelData = {
                name: longString,
                guildId: `guild-${longString}`,
                type: 'text'
            };
            const result = await channelRepository.create(channelData);
            expect(result.name).toBe(longString);
            expect(result.guildId).toBe(`guild-${longString}`);
        });
        it('should handle DM channels correctly in guild queries', async () => {
            // Create DM channel (no guildId)
            const dmChannel = await channelRepository.create({
                name: 'dm-channel',
                type: 'dm'
            });
            // Create regular guild channel
            const guildChannel = await channelRepository.create({
                name: 'guild-channel',
                guildId: 'guild-1',
                type: 'text'
            });
            // DM channel should not appear in guild queries
            const guildChannels = await channelRepository.findByGuild('guild-1');
            expect(guildChannels).toHaveLength(1);
            expect(guildChannels[0].id).toBe(guildChannel.id);
            // But should appear in type queries
            const dmChannels = await channelRepository.findByType('dm');
            expect(dmChannels).toHaveLength(1);
            expect(dmChannels[0].id).toBe(dmChannel.id);
        });
    });
    describe('complex scenarios', () => {
        it('should handle mixed guild and non-guild channels', async () => {
            // Create mix of channels
            const channels = await Promise.all([
                channelRepository.create({ name: 'guild1-text', guildId: 'guild-1', type: 'text' }),
                channelRepository.create({ name: 'guild1-voice', guildId: 'guild-1', type: 'voice' }),
                channelRepository.create({ name: 'guild2-text', guildId: 'guild-2', type: 'text' }),
                channelRepository.create({ name: 'dm1', type: 'dm' }),
                channelRepository.create({ name: 'dm2', type: 'dm' })
            ]);
            // Verify various queries work correctly
            const allChannels = await channelRepository.findAll();
            expect(allChannels).toHaveLength(5);
            const guild1Channels = await channelRepository.findByGuild('guild-1');
            expect(guild1Channels).toHaveLength(2);
            const textChannels = await channelRepository.findByType('text');
            expect(textChannels).toHaveLength(2);
            const dmChannels = await channelRepository.findByType('dm');
            expect(dmChannels).toHaveLength(2);
        });
        it('should maintain referential integrity when updating types', async () => {
            const channel = await channelRepository.create({
                name: 'changing-channel',
                guildId: 'guild-1',
                type: 'text'
            });
            // Change from text to voice
            await channelRepository.update(channel.id, { type: 'voice' });
            const textChannels = await channelRepository.findByType('text');
            const voiceChannels = await channelRepository.findByType('voice');
            expect(textChannels).toHaveLength(0);
            expect(voiceChannels).toHaveLength(1);
            expect(voiceChannels[0].id).toBe(channel.id);
        });
    });
});
//# sourceMappingURL=channel-repository.test.js.map