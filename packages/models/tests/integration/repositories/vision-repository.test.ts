import { VisionRepository } from '@/repositories/VisionRepository';
import { StarshipRepository } from '@/repositories/StarshipRepository';
import { UserRepository } from '@/repositories/UserRepository';
import { Vision } from '@/types';
import { getConnection } from '@/connection';

describe('VisionRepository Integration Tests', () => {
  let visionRepository: VisionRepository;
  let starshipRepository: StarshipRepository;
  let userRepository: UserRepository;
  let connection: any;

  beforeEach(async () => {
    connection = getConnection();
    visionRepository = new VisionRepository();
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
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const visionData = {
        starshipId: starship.id,
        statement: 'Build amazing AI products that help humanity',
        confidence: 85,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
      };

      const result = await visionRepository.create(visionData);

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^test-uuid-\d+$/);
      expect(result.starshipId).toBe(visionData.starshipId);
      expect(result.statement).toBe(visionData.statement);
      expect(result.confidence).toBe(visionData.confidence);
      expect(result.refinementCount).toBe(visionData.refinementCount);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      // Verify it was actually saved to the database
      const savedVision = await visionRepository.findById(result.id);
      expect(savedVision).not.toBeNull();
      expect(savedVision?.statement).toBe(visionData.statement);

      // Verify relationship with starship was created
      const relationship = await connection.executeQuery(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_VISION]->(v:Vision {id: $visionId})
         RETURN r`,
        { starshipId: starship.id, visionId: result.id }
      );
      expect(relationship).toHaveLength(1);
      expect(relationship[0].r.properties.createdAt).toBeDefined();
    });

    it('should handle confidence values correctly', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      // Test various confidence values
      const visionData = {
        starshipId: starship.id,
        statement: 'Test vision with specific confidence',
        confidence: 42,
        lastRefined: new Date().toISOString(),
        refinementCount: 5,
        isActive: true,
      };

      const result = await visionRepository.create(visionData);

      expect(result.confidence).toBe(42);
      expect(result.refinementCount).toBe(5);
    });
  });

  describe('findByStarship()', () => {
    it('should return vision for specific starship', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test',
      });

      const starship1 = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship 1',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const starship2 = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship 2',
        class: 'cruiser',
        maxActiveExpeditions: 5,
        status: 'active',
      });

      // Create visions for different starships
      const vision1 = await visionRepository.create({
        starshipId: starship1.id,
        statement: 'Vision for starship 1',
        confidence: 80,
        lastRefined: new Date().toISOString(),
        refinementCount: 1,
        isActive: true,
      });

      const vision2 = await visionRepository.create({
        starshipId: starship2.id,
        statement: 'Vision for starship 2',
        confidence: 90,
        lastRefined: new Date().toISOString(),
        refinementCount: 2,
        isActive: true,
      });

      const foundVision1 = await visionRepository.findByStarship(starship1.id);
      const foundVision2 = await visionRepository.findByStarship(starship2.id);

      expect(foundVision1).not.toBeNull();
      expect(foundVision1?.id).toBe(vision1.id);
      expect(foundVision1?.statement).toBe('Vision for starship 1');

      expect(foundVision2).not.toBeNull();
      expect(foundVision2?.id).toBe(vision2.id);
      expect(foundVision2?.statement).toBe('Vision for starship 2');
    });

    it('should return null when no vision exists for starship', async () => {
      const result = await visionRepository.findByStarship('nonexistent-starship');
      expect(result).toBeNull();
    });
  });

  describe('updateStatement()', () => {
    it('should update statement and increment refinement count', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const vision = await visionRepository.create({
        starshipId: starship.id,
        statement: 'Original vision statement',
        confidence: 75,
        lastRefined: new Date(Date.now() - 1000).toISOString(),
        refinementCount: 2,
        isActive: true,
      });

      const newStatement = 'Updated vision statement with more clarity';
      const updatedVision = await visionRepository.updateStatement(starship.id, newStatement);

      expect(updatedVision).not.toBeNull();
      expect(updatedVision?.statement).toBe(newStatement);
      expect(updatedVision?.refinementCount).toBe(3); // Should be incremented
      expect(updatedVision?.lastRefined).not.toBe(vision.lastRefined); // Should be updated
      expect(updatedVision?.updatedAt).not.toBe(vision.updatedAt); // Should be updated
      expect(updatedVision?.confidence).toBe(vision.confidence); // Should remain unchanged
    });

    it('should return null when updating vision for non-existent starship', async () => {
      const result = await visionRepository.updateStatement(
        'nonexistent-starship',
        'Some statement'
      );
      expect(result).toBeNull();
    });

    it('should handle refinement count correctly from zero', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const vision = await visionRepository.create({
        starshipId: starship.id,
        statement: 'Brand new vision',
        confidence: 60,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
      });

      const updatedVision = await visionRepository.updateStatement(
        starship.id,
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
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const vision = await visionRepository.create({
        starshipId: starship.id,
        statement: 'Original statement',
        confidence: 70,
        lastRefined: new Date().toISOString(),
        refinementCount: 1,
        isActive: true,
      });

      const originalUpdatedAt = vision.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updates = {
        statement: 'Updated statement',
        confidence: 85,
        refinementCount: 3,
      };

      const updatedVision = await visionRepository.update(vision.id, updates);

      expect(updatedVision).not.toBeNull();
      expect(updatedVision?.statement).toBe(updates.statement);
      expect(updatedVision?.confidence).toBe(updates.confidence);
      expect(updatedVision?.refinementCount).toBe(updates.refinementCount);
      expect(updatedVision?.starshipId).toBe(vision.starshipId); // Should remain unchanged
      expect(updatedVision?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should return null when updating non-existent vision', async () => {
      const result = await visionRepository.update('nonexistent-id', {
        statement: 'Updated statement',
      });

      expect(result).toBeNull();
    });
  });

  describe('findById()', () => {
    it('should return vision when found', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const visionData = {
        starshipId: starship.id,
        statement: 'Findable vision',
        confidence: 95,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
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
        displayName: 'Captain Test',
      });

      const starship1 = await starshipRepository.create({
        ownerId: user.id,
        name: 'Ship One',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const starship2 = await starshipRepository.create({
        ownerId: user.id,
        name: 'Ship Two',
        class: 'cruiser',
        maxActiveExpeditions: 5,
        status: 'active',
      });

      const vision1 = await visionRepository.create({
        starshipId: starship1.id,
        statement: 'First vision',
        confidence: 80,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const vision2 = await visionRepository.create({
        starshipId: starship2.id,
        statement: 'Second vision',
        confidence: 90,
        lastRefined: new Date().toISOString(),
        refinementCount: 1,
        isActive: true,
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
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const vision = await visionRepository.create({
        starshipId: starship.id,
        statement: 'Vision to be deleted',
        confidence: 50,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
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
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      // Test minimum confidence (0)
      const minVision = await visionRepository.create({
        starshipId: starship.id,
        statement: 'Very uncertain vision',
        confidence: 0,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
      });

      expect(minVision.confidence).toBe(0);

      // Test maximum confidence (100)
      const maxVision = await visionRepository.create({
        starshipId: starship.id,
        statement: 'Absolutely certain vision',
        confidence: 100,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
      });

      expect(maxVision.confidence).toBe(100);
    });
  });

  describe('database constraints', () => {
    it('should enforce unique vision IDs', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const vision = await visionRepository.create({
        starshipId: starship.id,
        statement: 'Unique vision',
        confidence: 75,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
      });

      // Try to create a vision with the same ID directly via connection
      await expect(
        connection.executeWrite(
          'CREATE (v:Vision {id: $id, statement: "Duplicate", starshipId: "other-starship"})',
          { id: vision.id }
        )
      ).rejects.toThrow();
    });
  });

  describe('complex scenarios', () => {
    it('should maintain vision-starship relationship integrity', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const vision = await visionRepository.create({
        starshipId: starship.id,
        statement: 'Linked vision',
        confidence: 80,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
      });

      // Verify the vision can be found through starship relationship
      const foundVision = await visionRepository.findByStarship(starship.id);
      expect(foundVision?.id).toBe(vision.id);

      // Verify relationship exists in graph
      const relationship = await connection.executeQuery(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_VISION]->(v:Vision {id: $visionId})
         RETURN r, s, v`,
        { starshipId: starship.id, visionId: vision.id }
      );

      expect(relationship).toHaveLength(1);
      expect(relationship[0].s.id).toBe(starship.id);
      expect(relationship[0].v.id).toBe(vision.id);
    });

    it('should handle multiple refinements correctly', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test',
      });

      const starship = await starshipRepository.create({
        ownerId: user.id,
        name: 'Test Ship',
        class: 'scout',
        maxActiveExpeditions: 3,
        status: 'active',
      });

      const vision = await visionRepository.create({
        starshipId: starship.id,
        statement: 'Initial rough vision',
        confidence: 40,
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
        isActive: true,
      });

      // First refinement
      const refined1 = await visionRepository.updateStatement(
        starship.id,
        'First refinement with more detail'
      );
      expect(refined1?.refinementCount).toBe(1);

      // Second refinement
      const refined2 = await visionRepository.updateStatement(
        starship.id,
        'Second refinement with even more clarity'
      );
      expect(refined2?.refinementCount).toBe(2);

      // Third refinement
      const refined3 = await visionRepository.updateStatement(
        starship.id,
        'Final polished vision statement'
      );
      expect(refined3?.refinementCount).toBe(3);
      expect(refined3?.statement).toBe('Final polished vision statement');
    });
  });
});
