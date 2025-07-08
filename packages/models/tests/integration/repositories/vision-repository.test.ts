import { VisionRepository } from '@/repositories/VisionRepository';
import { CodexRepository } from '@/repositories/CodexRepository';
import { StarshipRepository } from '@/repositories/StarshipRepository';
import { UserRepository } from '@/repositories/UserRepository';
import { Vision } from '@/types';
import { getConnection } from '@/connection';

describe('VisionRepository Integration Tests', () => {
  let visionRepository: VisionRepository;
  let codexRepository: CodexRepository;
  let starshipRepository: StarshipRepository;
  let userRepository: UserRepository;
  let connection: any;

  beforeEach(async () => {
    connection = getConnection();
    visionRepository = new VisionRepository();
    codexRepository = new CodexRepository();
    starshipRepository = new StarshipRepository();
    userRepository = new UserRepository();
    
    // Clean up any existing test data
    await connection.executeWrite('MATCH (n) DETACH DELETE n');
  });

  describe('create()', () => {
    it('should create vision with generated ID and timestamps', async () => {
      // Create prerequisite entities
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      const visionData = {
        codexId: codex.id,
        statement: 'Build amazing AI products that help humanity',
        confidence: 85,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      };

      const result = await visionRepository.create(visionData);

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^test-uuid-\d+$/);
      expect(result.codexId).toBe(visionData.codexId);
      expect(result.statement).toBe(visionData.statement);
      expect(result.confidence).toBe(visionData.confidence);
      expect(result.refinementCount).toBe(visionData.refinementCount);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      // Verify it was actually saved to the database
      const savedVision = await visionRepository.findById(result.id);
      expect(savedVision).not.toBeNull();
      expect(savedVision?.statement).toBe(visionData.statement);

      // Verify relationship with codex was created
      const relationship = await connection.executeQuery(
        `MATCH (c:Codex {id: $codexId})-[r:CONTAINS]->(v:Vision {id: $visionId})
         RETURN r`,
        { codexId: codex.id, visionId: result.id }
      );
      expect(relationship).toHaveLength(1);
      expect(relationship[0].r.properties.addedAt).toBeDefined();
    });

    it('should handle confidence values correctly', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      // Test various confidence values
      const visionData = {
        codexId: codex.id,
        statement: 'Test vision with specific confidence',
        confidence: 42,
        lastRefined: new Date().toISOString(),
        refinementCount: 5
      };

      const result = await visionRepository.create(visionData);

      expect(result.confidence).toBe(42);
      expect(result.refinementCount).toBe(5);
    });
  });

  describe('findByCodex()', () => {
    it('should return vision for specific codex', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex1 = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'First codex',
        isActive: true
      });

      const codex2 = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.1',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Second codex',
        isActive: false
      });

      // Create visions for different codex
      const vision1 = await visionRepository.create({
        codexId: codex1.id,
        statement: 'Vision for codex 1',
        confidence: 80,
        lastRefined: new Date().toISOString(),
        refinementCount: 1
      });

      const vision2 = await visionRepository.create({
        codexId: codex2.id,
        statement: 'Vision for codex 2',
        confidence: 90,
        lastRefined: new Date().toISOString(),
        refinementCount: 2
      });

      const foundVision1 = await visionRepository.findByCodex(codex1.id);
      const foundVision2 = await visionRepository.findByCodex(codex2.id);

      expect(foundVision1).not.toBeNull();
      expect(foundVision1?.id).toBe(vision1.id);
      expect(foundVision1?.statement).toBe('Vision for codex 1');

      expect(foundVision2).not.toBeNull();
      expect(foundVision2?.id).toBe(vision2.id);
      expect(foundVision2?.statement).toBe('Vision for codex 2');
    });

    it('should return null when no vision exists for codex', async () => {
      const result = await visionRepository.findByCodex('nonexistent-codex');
      expect(result).toBeNull();
    });
  });

  describe('updateStatement()', () => {
    it('should update statement and increment refinement count', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      const vision = await visionRepository.create({
        codexId: codex.id,
        statement: 'Original vision statement',
        confidence: 75,
        lastRefined: new Date(Date.now() - 1000).toISOString(),
        refinementCount: 2
      });

      const newStatement = 'Updated vision statement with more clarity';
      const updatedVision = await visionRepository.updateStatement(codex.id, newStatement);

      expect(updatedVision).not.toBeNull();
      expect(updatedVision?.statement).toBe(newStatement);
      expect(updatedVision?.refinementCount).toBe(3); // Should be incremented
      expect(updatedVision?.lastRefined).not.toBe(vision.lastRefined); // Should be updated
      expect(updatedVision?.updatedAt).not.toBe(vision.updatedAt); // Should be updated
      expect(updatedVision?.confidence).toBe(vision.confidence); // Should remain unchanged
    });

    it('should return null when updating vision for non-existent codex', async () => {
      const result = await visionRepository.updateStatement(
        'nonexistent-codex',
        'Some statement'
      );
      expect(result).toBeNull();
    });

    it('should handle refinement count correctly from zero', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      const vision = await visionRepository.create({
        codexId: codex.id,
        statement: 'Brand new vision',
        confidence: 60,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      });

      const updatedVision = await visionRepository.updateStatement(
        codex.id,
        'First refinement of the vision'
      );

      expect(updatedVision?.refinementCount).toBe(1);
    });
  });

  describe('update()', () => {
    it('should update vision properties and updatedAt timestamp', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      const vision = await visionRepository.create({
        codexId: codex.id,
        statement: 'Original statement',
        confidence: 70,
        lastRefined: new Date().toISOString(),
        refinementCount: 1
      });

      const originalUpdatedAt = vision.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const updates = {
        statement: 'Updated statement',
        confidence: 85,
        refinementCount: 3
      };

      const updatedVision = await visionRepository.update(vision.id, updates);

      expect(updatedVision).not.toBeNull();
      expect(updatedVision?.statement).toBe(updates.statement);
      expect(updatedVision?.confidence).toBe(updates.confidence);
      expect(updatedVision?.refinementCount).toBe(updates.refinementCount);
      expect(updatedVision?.codexId).toBe(vision.codexId); // Should remain unchanged
      expect(updatedVision?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should return null when updating non-existent vision', async () => {
      const result = await visionRepository.update('nonexistent-id', {
        statement: 'Updated statement'
      });
      
      expect(result).toBeNull();
    });
  });

  describe('findById()', () => {
    it('should return vision when found', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      const visionData = {
        codexId: codex.id,
        statement: 'Findable vision',
        confidence: 95,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      };

      const createdVision = await visionRepository.create(visionData);
      const foundVision = await visionRepository.findById(createdVision.id);

      expect(foundVision).not.toBeNull();
      expect(foundVision?.id).toBe(createdVision.id);
      expect(foundVision?.statement).toBe(visionData.statement);
    });

    it('should return null when vision not found', async () => {
      const result = await visionRepository.findById('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('should return all visions ordered by creation date DESC', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex1 = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'First codex',
        isActive: true
      });

      const codex2 = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.1',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Second codex',
        isActive: false
      });

      const vision1 = await visionRepository.create({
        codexId: codex1.id,
        statement: 'First vision',
        confidence: 80,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const vision2 = await visionRepository.create({
        codexId: codex2.id,
        statement: 'Second vision',
        confidence: 90,
        lastRefined: new Date().toISOString(),
        refinementCount: 1
      });

      const allVisions = await visionRepository.findAll();

      expect(allVisions).toHaveLength(2);
      // Should be ordered by createdAt DESC (newest first)
      expect(allVisions[0].id).toBe(vision2.id);
      expect(allVisions[1].id).toBe(vision1.id);
    });

    it('should return empty array when no visions exist', async () => {
      const result = await visionRepository.findAll();
      expect(result).toEqual([]);
    });
  });

  describe('delete()', () => {
    it('should delete vision and return true on success', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      const vision = await visionRepository.create({
        codexId: codex.id,
        statement: 'Vision to be deleted',
        confidence: 50,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      });

      const deleteResult = await visionRepository.delete(vision.id);

      expect(deleteResult).toBe(true);

      // Verify it was actually deleted
      const foundVision = await visionRepository.findById(vision.id);
      expect(foundVision).toBeNull();
    });

    it('should return false when vision not found', async () => {
      const result = await visionRepository.delete('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('confidence validation', () => {
    it('should handle confidence boundaries correctly', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      // Test minimum confidence (0)
      const minVision = await visionRepository.create({
        codexId: codex.id,
        statement: 'Very uncertain vision',
        confidence: 0,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      });

      expect(minVision.confidence).toBe(0);

      // Test maximum confidence (100)
      const maxVision = await visionRepository.create({
        codexId: codex.id,
        statement: 'Absolutely certain vision',
        confidence: 100,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      });

      expect(maxVision.confidence).toBe(100);
    });
  });

  describe('database constraints', () => {
    it('should enforce unique vision IDs', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      const vision = await visionRepository.create({
        codexId: codex.id,
        statement: 'Unique vision',
        confidence: 75,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      });

      // Try to create a vision with the same ID directly via connection
      await expect(
        connection.executeWrite(
          'CREATE (v:Vision {id: $id, statement: "Duplicate", codexId: "other-codex"})',
          { id: vision.id }
        )
      ).rejects.toThrow();
    });
  });

  describe('complex scenarios', () => {
    it('should maintain vision-codex relationship integrity', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      const vision = await visionRepository.create({
        codexId: codex.id,
        statement: 'Linked vision',
        confidence: 80,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      });

      // Verify the vision can be found through codex relationship
      const foundVision = await visionRepository.findByCodex(codex.id);
      expect(foundVision?.id).toBe(vision.id);

      // Verify relationship exists in graph
      const relationship = await connection.executeQuery(
        `MATCH (c:Codex {id: $codexId})-[r:CONTAINS]->(v:Vision {id: $visionId})
         RETURN r, c, v`,
        { codexId: codex.id, visionId: vision.id }
      );

      expect(relationship).toHaveLength(1);
      expect(relationship[0].c.id).toBe(codex.id);
      expect(relationship[0].v.id).toBe(vision.id);
    });

    it('should handle multiple refinements correctly', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const codex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex',
        isActive: true
      });

      const vision = await visionRepository.create({
        codexId: codex.id,
        statement: 'Initial rough vision',
        confidence: 40,
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      });

      // First refinement
      const refined1 = await visionRepository.updateStatement(
        codex.id,
        'First refinement with more detail'
      );
      expect(refined1?.refinementCount).toBe(1);

      // Second refinement
      const refined2 = await visionRepository.updateStatement(
        codex.id,
        'Second refinement with even more clarity'
      );
      expect(refined2?.refinementCount).toBe(2);

      // Third refinement
      const refined3 = await visionRepository.updateStatement(
        codex.id,
        'Final polished vision statement'
      );
      expect(refined3?.refinementCount).toBe(3);
      expect(refined3?.statement).toBe('Final polished vision statement');
    });
  });
});