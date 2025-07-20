import { StarshipRepository } from '@/repositories/StarshipRepository';
import { AgentRepository } from '@/repositories/AgentRepository';
import { UserRepository } from '@/repositories/UserRepository';
import { Starship, Agent, User } from '@/types';
import { getConnection } from '@/connection';

describe('StarshipRepository Integration Tests', () => {
  let starshipRepository: StarshipRepository;
  let agentRepository: AgentRepository;
  let userRepository: UserRepository;
  let connection: any;

  beforeEach(async () => {
    connection = getConnection();
    starshipRepository = new StarshipRepository();
    agentRepository = new AgentRepository();
    userRepository = new UserRepository();
    
    // Clean up any existing test data
    await connection.executeWrite('MATCH (n) DETACH DELETE n');
  });

  describe('create()', () => {
    it('should create starship with correct maxAgents for scout class', async () => {
      // Create a user first
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starshipData = {
        ownerId: user.id,
        name: 'Test Scout',
        class: 'scout' as const,
        maxActiveExpeditions: 2,
        status: 'active' as const
      };

      const result = await starshipRepository.create(starshipData);

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^test-uuid-\d+$/);
      expect(result.name).toBe(starshipData.name);
      expect(result.class).toBe(starshipData.class);
      expect(result.maxAgents).toBe(3); // Scout class should have 3 max agents
      expect(result.ownerId).toBe(user.id);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      // Verify ownership relationship was created
      const ownershipCheck = await connection.executeQuery(
        `MATCH (u:User {id: $userId})-[r:OWNS]->(s:Starship {id: $starshipId})
         RETURN r`,
        { userId: user.id, starshipId: result.id }
      );
      expect(ownershipCheck).toHaveLength(1);
    });

    it('should create starship with correct maxAgents for cruiser class', async () => {
      // Create a user first
      const user = await userRepository.create({
        username: 'captain2',
        email: 'captain2@starships.ai',
        displayName: 'Captain Test 2'
      });

      const starshipData = {
        ownerId: user.id,
        name: 'Test Cruiser',
        class: 'cruiser' as const,
        maxActiveExpeditions: 4,
        status: 'active' as const
      };

      const result = await starshipRepository.create(starshipData);

      expect(result.maxAgents).toBe(6); // Cruiser class should have 6 max agents
      expect(result.class).toBe('cruiser');
    });
  });

  describe('findById()', () => {
    it('should return starship when found', async () => {
      const user = await userRepository.create({
        username: 'owner',
        email: 'owner@starships.ai',
        displayName: 'Owner Test'
      });

      const starshipData = {
        ownerId: user.id,
        name: 'Findable Ship',
        class: 'scout' as const,
        maxActiveExpeditions: 2,
        status: 'active' as const
      };

      const createdStarship = await starshipRepository.create(starshipData);
      const foundStarship = await starshipRepository.findById(createdStarship.id);

      expect(foundStarship).not.toBeNull();
      expect(foundStarship?.id).toBe(createdStarship.id);
      expect(foundStarship?.name).toBe(starshipData.name);
    });

    it('should return null when starship not found', async () => {
      const result = await starshipRepository.findById('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('findByOwner()', () => {
    it('should return all starships owned by user', async () => {
      const user = await userRepository.create({
        username: 'fleetowner',
        email: 'fleet@starships.ai',
        displayName: 'Fleet Owner'
      });

      const starship1 = await starshipRepository.create({
        ownerId: user.id,
        name: 'Ship One',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      const starship2 = await starshipRepository.create({
        ownerId: user.id,
        name: 'Ship Two',
        class: 'cruiser',
        maxActiveExpeditions: 4,
        status: 'inactive'
      });

      // Create another user's starship to ensure filtering works
      const otherUser = await userRepository.create({
        username: 'other',
        email: 'other@starships.ai',
        displayName: 'Other User'
      });

      await starshipRepository.create({
        ownerId: otherUser.id,
        name: 'Other Ship',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      const userStarships = await starshipRepository.findByOwner(user.id);

      expect(userStarships).toHaveLength(2);
      expect(userStarships.map(s => s.id)).toContain(starship1.id);
      expect(userStarships.map(s => s.id)).toContain(starship2.id);
      
      // Should be ordered by createdAt DESC (newest first)
      expect(userStarships[0].name).toBe('Ship Two');
      expect(userStarships[1].name).toBe('Ship One');
    });

    it('should return empty array when user has no starships', async () => {
      const result = await starshipRepository.findByOwner('nonexistent-user');
      expect(result).toEqual([]);
    });
  });

  describe('deployAgent()', () => {
    it('should deploy agent to starship successfully', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      const agent = await agentRepository.create({
        name: 'Test Agent',
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });

      const deployResult = await starshipRepository.deployAgent(starship.id, agent.id);

      expect(deployResult).toBe(true);

      // Verify the relationship was created
      const deployedAgents = await starshipRepository.getDeployedAgents(starship.id);
      expect(deployedAgents).toHaveLength(1);
      expect(deployedAgents[0].id).toBe(agent.id);
    });

    it('should throw error when no available slots', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Full Ship',
        class: 'scout', // Max 3 agents
        maxActiveExpeditions: 2,
        status: 'active'
      });

      // Create and deploy 3 agents (filling all slots)
      const agents = [];
      for (let i = 1; i <= 3; i++) {
        const agent = await agentRepository.create({
          name: `Agent ${i}`,
          model: 'gpt-4',
          systemPrompt: `You are agent ${i}`,
          starshipId: starship.id,
          authorId: user.id,
          category: 'general',
          tags: ['test'],
          isPublic: false,
          version: '1.0.0'
        });
        agents.push(agent);
        await starshipRepository.deployAgent(starship.id, agent.id);
      }

      // Try to deploy a 4th agent
      const extraAgent = await agentRepository.create({
        name: 'Extra Agent',
        model: 'gpt-4',
        systemPrompt: 'You are the extra agent',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });

      await expect(
        starshipRepository.deployAgent(starship.id, extraAgent.id)
      ).rejects.toThrow('No available agent slots');
    });

    it('should throw error when agent is already deployed', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      const agent = await agentRepository.create({
        name: 'Test Agent',
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });

      // Deploy agent once
      await starshipRepository.deployAgent(starship.id, agent.id);

      // Try to deploy same agent again
      await expect(
        starshipRepository.deployAgent(starship.id, agent.id)
      ).rejects.toThrow('Agent is already deployed on this starship');
    });
  });

  describe('removeAgent()', () => {
    it('should remove agent from starship successfully', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      const agent = await agentRepository.create({
        name: 'Test Agent',
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });

      // Deploy agent first
      await starshipRepository.deployAgent(starship.id, agent.id);
      
      // Verify agent is deployed
      let deployedAgents = await starshipRepository.getDeployedAgents(starship.id);
      expect(deployedAgents).toHaveLength(1);

      // Remove agent
      const removeResult = await starshipRepository.removeAgent(starship.id, agent.id);
      expect(removeResult).toBe(true);

      // Verify agent is no longer deployed
      deployedAgents = await starshipRepository.getDeployedAgents(starship.id);
      expect(deployedAgents).toHaveLength(0);
    });

    it('should return false when agent not deployed on starship', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      const agent = await agentRepository.create({
        name: 'Test Agent',
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });

      // Try to remove agent that was never deployed
      const removeResult = await starshipRepository.removeAgent(starship.id, agent.id);
      expect(removeResult).toBe(false);
    });
  });

  describe('getAvailableSlots()', () => {
    it('should return correct available slots for scout class', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Scout Ship',
        class: 'scout', // Max 3 agents
        maxActiveExpeditions: 2,
        status: 'active'
      });

      // Initially should have 3 available slots
      let availableSlots = await starshipRepository.getAvailableSlots(starship.id);
      expect(availableSlots).toBe(3);

      // Deploy one agent
      const agent1 = await agentRepository.create({
        name: 'Agent 1',
        model: 'gpt-4',
        systemPrompt: 'Agent 1',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });
      await starshipRepository.deployAgent(starship.id, agent1.id);

      // Should have 2 available slots
      availableSlots = await starshipRepository.getAvailableSlots(starship.id);
      expect(availableSlots).toBe(2);

      // Deploy second agent
      const agent2 = await agentRepository.create({
        name: 'Agent 2',
        model: 'claude-3',
        systemPrompt: 'Agent 2',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });
      await starshipRepository.deployAgent(starship.id, agent2.id);

      // Should have 1 available slot
      availableSlots = await starshipRepository.getAvailableSlots(starship.id);
      expect(availableSlots).toBe(1);

      // Deploy third agent
      const agent3 = await agentRepository.create({
        name: 'Agent 3',
        model: 'gpt-4',
        systemPrompt: 'Agent 3',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });
      await starshipRepository.deployAgent(starship.id, agent3.id);

      // Should have 0 available slots
      availableSlots = await starshipRepository.getAvailableSlots(starship.id);
      expect(availableSlots).toBe(0);
    });

    it('should return correct available slots for cruiser class', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Cruiser Ship',
        class: 'cruiser', // Max 6 agents
        maxActiveExpeditions: 4,
        status: 'active'
      });

      // Initially should have 6 available slots
      const availableSlots = await starshipRepository.getAvailableSlots(starship.id);
      expect(availableSlots).toBe(6);
    });
  });

  describe('getDeployedAgents()', () => {
    it('should return deployed agents ordered by name', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      // Create agents with names that will test ordering
      const agentCharlie = await agentRepository.create({
        name: 'Charlie',
        model: 'gpt-4',
        systemPrompt: 'Charlie',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });

      const agentAlice = await agentRepository.create({
        name: 'Alice',
        model: 'claude-3',
        systemPrompt: 'Alice',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });

      const agentBob = await agentRepository.create({
        name: 'Bob',
        model: 'gpt-4',
        systemPrompt: 'Bob',
        starshipId: starship.id,
        authorId: user.id,
        category: 'general',
        tags: ['test'],
        isPublic: false,
        version: '1.0.0'
      });

      // Deploy agents in random order
      await starshipRepository.deployAgent(starship.id, agentCharlie.id);
      await starshipRepository.deployAgent(starship.id, agentAlice.id);
      await starshipRepository.deployAgent(starship.id, agentBob.id);

      const deployedAgents = await starshipRepository.getDeployedAgents(starship.id);

      expect(deployedAgents).toHaveLength(3);
      // Should be ordered by name
      expect(deployedAgents[0].name).toBe('Alice');
      expect(deployedAgents[1].name).toBe('Bob');
      expect(deployedAgents[2].name).toBe('Charlie');
    });

    it('should return empty array when no agents deployed', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Empty Ship',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      const deployedAgents = await starshipRepository.getDeployedAgents(starship.id);
      expect(deployedAgents).toEqual([]);
    });
  });

  describe('update()', () => {
    it('should update starship properties and updatedAt timestamp', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Original Name',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      const originalUpdatedAt = starship.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const updates = {
        name: 'Updated Name',
        maxActiveExpeditions: 3,
        status: 'inactive' as const
      };

      const updatedStarship = await starshipRepository.update(starship.id, updates);

      expect(updatedStarship).not.toBeNull();
      expect(updatedStarship?.name).toBe(updates.name);
      expect(updatedStarship?.maxActiveExpeditions).toBe(updates.maxActiveExpeditions);
      expect(updatedStarship?.status).toBe(updates.status);
      expect(updatedStarship?.class).toBe(starship.class); // Should remain unchanged
      expect(updatedStarship?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should return null when updating non-existent starship', async () => {
      const result = await starshipRepository.update('nonexistent-id', {
        name: 'Updated Name'
      });
      
      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should delete starship and return true on success', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Deletable Ship',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      const deleteResult = await starshipRepository.delete(starship.id);

      expect(deleteResult).toBe(true);

      // Verify it was actually deleted
      const foundStarship = await starshipRepository.findById(starship.id);
      expect(foundStarship).toBeNull();
    });

    it('should return false when starship not found', async () => {
      const result = await starshipRepository.delete('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('database constraints', () => {
    it('should enforce unique starship IDs', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Unique Ship',
        class: 'scout',
        maxActiveExpeditions: 2,
        status: 'active'
      });

      // Try to create a starship with the same ID directly via connection
      await expect(
        connection.executeWrite(
          'CREATE (s:Starship {id: $id, name: "Duplicate", class: "scout"})',
          { id: starship.id }
        )
      ).rejects.toThrow();
    });
  });
});