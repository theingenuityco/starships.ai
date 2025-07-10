import { AgentRepository } from '@/repositories/AgentRepository';
import { Agent } from '@/types';
import { getConnection } from '@/connection';

describe('AgentRepository Integration Tests', () => {
  let agentRepository: AgentRepository;
  let connection: any;

  beforeEach(async () => {
    connection = getConnection();
    agentRepository = new AgentRepository();

    // Clean up any existing test data
    await connection.executeWrite('MATCH (n) DETACH DELETE n');
  });

  describe('create()', () => {
    it('should create agent with generated ID and timestamp', async () => {
      const agentData = {
        name: 'Test Agent',
        model: 'gpt-4',
        systemPrompt: 'You are a helpful assistant',
        tags: ['test'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      };

      const result = await agentRepository.create(agentData);

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^test-uuid-\d+$/);
      expect(result.createdAt).toBeDefined();
      expect(result.name).toBe(agentData.name);
      expect(result.model).toBe(agentData.model);
      expect(result.systemPrompt).toBe(agentData.systemPrompt);

      // Verify it was actually saved to the database
      const savedAgent = await agentRepository.findById(result.id);
      expect(savedAgent).not.toBeNull();
      expect(savedAgent?.name).toBe(agentData.name);
    });

    it('should create multiple agents with unique IDs', async () => {
      const agent1Data = {
        name: 'Agent 1',
        model: 'gpt-4',
        systemPrompt: 'You are agent 1',
        tags: ['test'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      };

      const agent2Data = {
        name: 'Agent 2',
        model: 'claude-3',
        systemPrompt: 'You are agent 2',
        tags: ['test'],
        category: 'coding' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      };

      const agent1 = await agentRepository.create(agent1Data);
      const agent2 = await agentRepository.create(agent2Data);

      expect(agent1.id).not.toBe(agent2.id);
      expect(agent1.name).toBe(agent1Data.name);
      expect(agent2.name).toBe(agent2Data.name);
    });
  });

  describe('findById()', () => {
    it('should return agent when found', async () => {
      const agentData = {
        name: 'Findable Agent',
        model: 'gpt-4',
        systemPrompt: 'You can find me',
        tags: ['findable'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      };

      const createdAgent = await agentRepository.create(agentData);
      const foundAgent = await agentRepository.findById(createdAgent.id);

      expect(foundAgent).not.toBeNull();
      expect(foundAgent?.id).toBe(createdAgent.id);
      expect(foundAgent?.name).toBe(agentData.name);
    });

    it('should return null when agent not found', async () => {
      const result = await agentRepository.findById('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('should return all agents ordered by creation date', async () => {
      const agent1Data = {
        name: 'First Agent',
        model: 'gpt-4',
        systemPrompt: 'First',
        tags: ['first'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      };

      const agent2Data = {
        name: 'Second Agent',
        model: 'claude-3',
        systemPrompt: 'Second',
        tags: ['second'],
        category: 'coding' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      };

      const agent1 = await agentRepository.create(agent1Data);
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      const agent2 = await agentRepository.create(agent2Data);

      const allAgents = await agentRepository.findAll();

      expect(allAgents).toHaveLength(2);
      // Should be ordered by createdAt DESC (newest first)
      expect(allAgents[0].id).toBe(agent2.id);
      expect(allAgents[1].id).toBe(agent1.id);
    });

    it('should return empty array when no agents exist', async () => {
      const result = await agentRepository.findAll();
      expect(result).toEqual([]);
    });
  });

  describe('update()', () => {
    it('should update agent properties', async () => {
      const agentData = {
        name: 'Original Name',
        model: 'gpt-4',
        systemPrompt: 'Original prompt',
        tags: ['original'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      };

      const createdAgent = await agentRepository.create(agentData);

      const updates = {
        name: 'Updated Name',
        systemPrompt: 'Updated prompt',
      };

      const updatedAgent = await agentRepository.update(createdAgent.id, updates);

      expect(updatedAgent).not.toBeNull();
      expect(updatedAgent?.name).toBe(updates.name);
      expect(updatedAgent?.systemPrompt).toBe(updates.systemPrompt);
      expect(updatedAgent?.model).toBe(agentData.model); // Should remain unchanged
      expect(updatedAgent?.id).toBe(createdAgent.id);
    });

    it('should return null when updating non-existent agent', async () => {
      const result = await agentRepository.update('nonexistent-id', {
        name: 'Updated Name',
      });

      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should delete agent and return true on success', async () => {
      const agentData = {
        name: 'Deletable Agent',
        model: 'gpt-4',
        systemPrompt: 'I will be deleted',
        tags: ['deletable'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      };

      const createdAgent = await agentRepository.create(agentData);
      const deleteResult = await agentRepository.delete(createdAgent.id);

      expect(deleteResult).toBe(true);

      // Verify it was actually deleted
      const foundAgent = await agentRepository.findById(createdAgent.id);
      expect(foundAgent).toBeNull();
    });

    it('should return false when agent not found', async () => {
      const result = await agentRepository.delete('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('findByStarship()', () => {
    it('should return agents deployed on specific starship', async () => {
      // Create agents first
      const agent1 = await agentRepository.create({
        name: 'Agent 1',
        model: 'gpt-4',
        systemPrompt: 'Agent 1',
        tags: ['starship'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      });

      const agent2 = await agentRepository.create({
        name: 'Agent 2',
        model: 'claude-3',
        systemPrompt: 'Agent 2',
        tags: ['starship'],
        category: 'coding' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      });

      const agent3 = await agentRepository.create({
        name: 'Agent 3',
        model: 'gpt-4',
        systemPrompt: 'Agent 3',
        tags: ['undeployed'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      });

      // Create starship and deploy agents
      const starshipId = 'test-starship-1';
      await connection.executeWrite(
        'CREATE (s:Starship {id: $id, name: "Test Ship", class: "scout"})',
        { id: starshipId }
      );

      // Deploy agents 1 and 2 to the starship
      await connection.executeWrite(
        `MATCH (a:Agent {id: $agentId}), (s:Starship {id: $starshipId})
         CREATE (a)-[:DEPLOYED_ON]->(s)`,
        { agentId: agent1.id, starshipId }
      );

      await connection.executeWrite(
        `MATCH (a:Agent {id: $agentId}), (s:Starship {id: $starshipId})
         CREATE (a)-[:DEPLOYED_ON]->(s)`,
        { agentId: agent2.id, starshipId }
      );

      const deployedAgents = await agentRepository.findByStarship(starshipId);

      expect(deployedAgents).toHaveLength(2);
      expect(deployedAgents.map((a) => a.id)).toContain(agent1.id);
      expect(deployedAgents.map((a) => a.id)).toContain(agent2.id);
      expect(deployedAgents.map((a) => a.id)).not.toContain(agent3.id);

      // Should be ordered by name
      expect(deployedAgents[0].name).toBe('Agent 1');
      expect(deployedAgents[1].name).toBe('Agent 2');
    });

    it('should return empty array when no agents deployed on starship', async () => {
      const result = await agentRepository.findByStarship('nonexistent-starship');
      expect(result).toEqual([]);
    });
  });

  describe('findByChannel()', () => {
    it('should return agents active in specific channel', async () => {
      // Create agents
      const agent1 = await agentRepository.create({
        name: 'Channel Agent 1',
        model: 'gpt-4',
        systemPrompt: 'Channel agent 1',
        tags: ['channel'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      });

      const agent2 = await agentRepository.create({
        name: 'Channel Agent 2',
        model: 'claude-3',
        systemPrompt: 'Channel agent 2',
        tags: ['channel'],
        category: 'coding' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      });

      const agent3 = await agentRepository.create({
        name: 'Unassigned Agent',
        model: 'gpt-4',
        systemPrompt: 'Not in channel',
        tags: ['unassigned'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      });

      // Create channel and relationships
      const channelId = 'test-channel-1';
      await connection.executeWrite(
        'CREATE (c:Channel {id: $id, name: "Test Channel", guildId: "test-guild"})',
        { id: channelId }
      );

      // Make agents active in channel
      await connection.executeWrite(
        `MATCH (a:Agent {id: $agentId}), (c:Channel {id: $channelId})
         CREATE (a)-[:ACTIVE_IN]->(c)`,
        { agentId: agent1.id, channelId }
      );

      await connection.executeWrite(
        `MATCH (a:Agent {id: $agentId}), (c:Channel {id: $channelId})
         CREATE (a)-[:ACTIVE_IN]->(c)`,
        { agentId: agent2.id, channelId }
      );

      const channelAgents = await agentRepository.findByChannel(channelId);

      expect(channelAgents).toHaveLength(2);
      expect(channelAgents.map((a) => a.id)).toContain(agent1.id);
      expect(channelAgents.map((a) => a.id)).toContain(agent2.id);
      expect(channelAgents.map((a) => a.id)).not.toContain(agent3.id);
    });

    it('should return empty array when no agents active in channel', async () => {
      const result = await agentRepository.findByChannel('nonexistent-channel');
      expect(result).toEqual([]);
    });
  });

  describe('findByUser()', () => {
    it('should return agents user has interacted with', async () => {
      // Create agents
      const agent1 = await agentRepository.create({
        name: 'User Agent 1',
        model: 'gpt-4',
        systemPrompt: 'User agent 1',
        tags: ['user'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      });

      const agent2 = await agentRepository.create({
        name: 'User Agent 2',
        model: 'claude-3',
        systemPrompt: 'User agent 2',
        tags: ['user'],
        category: 'coding' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      });

      const agent3 = await agentRepository.create({
        name: 'Unused Agent',
        model: 'gpt-4',
        systemPrompt: 'Not interacted with',
        tags: ['unused'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      });

      // Create user and relationships
      const userId = 'test-user-1';
      await connection.executeWrite(
        'CREATE (u:User {id: $id, username: "testuser", email: "test@example.com"})',
        { id: userId }
      );

      // Create interaction relationships
      await connection.executeWrite(
        `MATCH (u:User {id: $userId}), (a:Agent {id: $agentId})
         CREATE (u)-[:INTERACTS_WITH]->(a)`,
        { userId, agentId: agent1.id }
      );

      await connection.executeWrite(
        `MATCH (u:User {id: $userId}), (a:Agent {id: $agentId})
         CREATE (u)-[:INTERACTS_WITH]->(a)`,
        { userId, agentId: agent2.id }
      );

      const userAgents = await agentRepository.findByUser(userId);

      expect(userAgents).toHaveLength(2);
      expect(userAgents.map((a) => a.id)).toContain(agent1.id);
      expect(userAgents.map((a) => a.id)).toContain(agent2.id);
      expect(userAgents.map((a) => a.id)).not.toContain(agent3.id);
    });

    it('should return empty array when user has not interacted with any agents', async () => {
      const result = await agentRepository.findByUser('nonexistent-user');
      expect(result).toEqual([]);
    });
  });

  describe('database constraints', () => {
    it('should enforce unique agent IDs', async () => {
      const agentData = {
        name: 'Unique Agent',
        model: 'gpt-4',
        systemPrompt: 'I am unique',
        tags: ['unique'],
        category: 'general' as const,
        authorId: 'test-user',
        isPublic: false,
        version: '1.0.0',
      };

      const agent1 = await agentRepository.create(agentData);

      // Try to create an agent with the same ID directly via connection
      await expect(
        connection.executeWrite(
          'CREATE (a:Agent {id: $id, name: "Duplicate", model: "gpt-4", systemPrompt: "Duplicate"})',
          { id: agent1.id }
        )
      ).rejects.toThrow();
    });
  });
});
