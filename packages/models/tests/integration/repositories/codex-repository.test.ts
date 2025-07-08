import { CodexRepository } from '@/repositories/CodexRepository';
import { StarshipRepository } from '@/repositories/StarshipRepository';
import { UserRepository } from '@/repositories/UserRepository';
import { Codex, Starship, User } from '@/types';
import { getConnection } from '@/connection';

describe('CodexRepository Integration Tests', () => {
  let codexRepository: CodexRepository;
  let starshipRepository: StarshipRepository;
  let userRepository: UserRepository;
  let connection: any;

  beforeEach(async () => {
    connection = getConnection();
    codexRepository = new CodexRepository();
    starshipRepository = new StarshipRepository();
    userRepository = new UserRepository();
    
    // Clean up any existing test data
    await connection.executeWrite('MATCH (n) DETACH DELETE n');
  });

  describe('create()', () => {
    it('should create codex with generated ID and timestamp', async () => {
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

      const codexData = {
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial codex creation',
        isActive: true
      };

      const result = await codexRepository.create(codexData);

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^test-uuid-\d+$/);
      expect(result.starshipId).toBe(codexData.starshipId);
      expect(result.version).toBe(codexData.version);
      expect(result.author).toBe(codexData.author);
      expect(result.isActive).toBe(true);
      expect(result.createdAt).toBeDefined();

      // Verify it was actually saved to the database
      const savedCodex = await codexRepository.findById(result.id);
      expect(savedCodex).not.toBeNull();
      expect(savedCodex?.version).toBe(codexData.version);

      // Verify active codex relationship was created
      const activeRelationship = await connection.executeQuery(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_ACTIVE_CODEX]->(c:Codex {id: $codexId})
         RETURN r`,
        { starshipId: starship.id, codexId: result.id }
      );
      expect(activeRelationship).toHaveLength(1);
    });

    it('should create inactive codex without active relationship', async () => {
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

      const codexData = {
        starshipId: starship.id,
        version: 'v1.1',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Inactive version',
        isActive: false
      };

      const result = await codexRepository.create(codexData);

      expect(result.isActive).toBe(false);

      // Verify no active relationship was created
      const activeRelationship = await connection.executeQuery(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_ACTIVE_CODEX]->(c:Codex {id: $codexId})
         RETURN r`,
        { starshipId: starship.id, codexId: result.id }
      );
      expect(activeRelationship).toHaveLength(0);
    });
  });

  describe('findActiveByStarship()', () => {
    it('should return active codex for starship', async () => {
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

      // Create inactive codex
      const inactiveCodex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Old version',
        isActive: false
      });

      // Create active codex
      const activeCodex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.1',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Current version',
        isActive: true
      });

      const result = await codexRepository.findActiveByStarship(starship.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(activeCodex.id);
      expect(result?.version).toBe('v1.1');
      expect(result?.isActive).toBe(true);
    });

    it('should return null when no active codex exists', async () => {
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

      const result = await codexRepository.findActiveByStarship(starship.id);
      expect(result).toBeNull();
    });
  });

  describe('getVersionHistory()', () => {
    it('should return all versions for starship ordered by timestamp DESC', async () => {
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

      // Create multiple versions with slight time differences
      const version1 = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date(Date.now() - 2000).toISOString(),
        author: user.id,
        changeSummary: 'First version',
        isActive: false
      });

      const version2 = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.1',
        timestamp: new Date(Date.now() - 1000).toISOString(),
        author: user.id,
        changeSummary: 'Second version',
        isActive: false
      });

      const version3 = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.2',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Latest version',
        isActive: true
      });

      const history = await codexRepository.getVersionHistory(starship.id);

      expect(history).toHaveLength(3);
      // Should be ordered by timestamp DESC (newest first)
      expect(history[0].version).toBe('v1.2');
      expect(history[1].version).toBe('v1.1');
      expect(history[2].version).toBe('v1.0');
    });

    it('should return empty array when no versions exist', async () => {
      const result = await codexRepository.getVersionHistory('nonexistent-starship');
      expect(result).toEqual([]);
    });
  });

  describe('createVersion()', () => {
    it('should create new version and deactivate previous version', async () => {
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

      // Create initial version
      const initialVersion = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Initial version',
        isActive: true
      });

      // Create new version using createVersion method
      const newVersion = await codexRepository.createVersion(
        starship.id,
        user.id,
        'Updated with new features'
      );

      expect(newVersion.version).toBe('v1.1');
      expect(newVersion.isActive).toBe(true);
      expect(newVersion.changeSummary).toBe('Updated with new features');

      // Verify previous version is deactivated
      const updatedInitialVersion = await codexRepository.findById(initialVersion.id);
      expect(updatedInitialVersion?.isActive).toBe(false);

      // Verify only new version is active
      const activeVersion = await codexRepository.findActiveByStarship(starship.id);
      expect(activeVersion?.id).toBe(newVersion.id);
    });

    it('should generate correct version numbers sequentially', async () => {
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

      // Create first version
      const v1 = await codexRepository.createVersion(
        starship.id,
        user.id,
        'First version'
      );
      expect(v1.version).toBe('v1.0');

      // Create second version
      const v2 = await codexRepository.createVersion(
        starship.id,
        user.id,
        'Second version'
      );
      expect(v2.version).toBe('v1.1');

      // Create third version
      const v3 = await codexRepository.createVersion(
        starship.id,
        user.id,
        'Third version'
      );
      expect(v3.version).toBe('v1.2');
    });
  });

  describe('deactivateCurrentVersion()', () => {
    it('should deactivate current active version and remove relationship', async () => {
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

      // Create active version
      const activeCodex = await codexRepository.create({
        starshipId: starship.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Active version',
        isActive: true
      });

      // Verify active relationship exists
      let activeRelationship = await connection.executeQuery(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_ACTIVE_CODEX]->(c:Codex)
         RETURN r`,
        { starshipId: starship.id }
      );
      expect(activeRelationship).toHaveLength(1);

      // Deactivate current version
      await codexRepository.deactivateCurrentVersion(starship.id);

      // Verify version is deactivated
      const updatedCodex = await codexRepository.findById(activeCodex.id);
      expect(updatedCodex?.isActive).toBe(false);

      // Verify active relationship is removed
      activeRelationship = await connection.executeQuery(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_ACTIVE_CODEX]->(c:Codex)
         RETURN r`,
        { starshipId: starship.id }
      );
      expect(activeRelationship).toHaveLength(0);

      // Verify no active codex found
      const activeCodexCheck = await codexRepository.findActiveByStarship(starship.id);
      expect(activeCodexCheck).toBeNull();
    });
  });

  describe('update()', () => {
    it('should update codex properties', async () => {
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
        changeSummary: 'Original summary',
        isActive: true
      });

      const updates = {
        changeSummary: 'Updated summary',
        isActive: false
      };

      const updatedCodex = await codexRepository.update(codex.id, updates);

      expect(updatedCodex).not.toBeNull();
      expect(updatedCodex?.changeSummary).toBe(updates.changeSummary);
      expect(updatedCodex?.isActive).toBe(updates.isActive);
      expect(updatedCodex?.version).toBe(codex.version); // Should remain unchanged
    });

    it('should return null when updating non-existent codex', async () => {
      const result = await codexRepository.update('nonexistent-id', {
        changeSummary: 'Updated summary'
      });
      
      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should delete codex and return true on success', async () => {
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
        changeSummary: 'To be deleted',
        isActive: true
      });

      const deleteResult = await codexRepository.delete(codex.id);

      expect(deleteResult).toBe(true);

      // Verify it was actually deleted
      const foundCodex = await codexRepository.findById(codex.id);
      expect(foundCodex).toBeNull();
    });

    it('should return false when codex not found', async () => {
      const result = await codexRepository.delete('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('findAll()', () => {
    it('should return all codex versions ordered by timestamp DESC', async () => {
      const user = await userRepository.create({
        username: 'captain',
        email: 'captain@starships.ai',
        displayName: 'Captain Test'
      });

      const starship1 = await starshipRepository.create({
        ownerId: user.id,
        name: 'Ship One',
        class: 'scout',
        powerLevel: 85,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      const starship2 = await starshipRepository.create({
        ownerId: user.id,
        name: 'Ship Two',
        class: 'cruiser',
        powerLevel: 95,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active'
      });

      // Create codex for ship 1
      const codex1 = await codexRepository.create({
        starshipId: starship1.id,
        version: 'v1.0',
        timestamp: new Date(Date.now() - 1000).toISOString(),
        author: user.id,
        changeSummary: 'Ship 1 codex',
        isActive: true
      });

      // Create codex for ship 2 (more recent)
      const codex2 = await codexRepository.create({
        starshipId: starship2.id,
        version: 'v1.0',
        timestamp: new Date().toISOString(),
        author: user.id,
        changeSummary: 'Ship 2 codex',
        isActive: true
      });

      const allCodex = await codexRepository.findAll();

      expect(allCodex).toHaveLength(2);
      // Should be ordered by timestamp DESC (newest first)
      expect(allCodex[0].id).toBe(codex2.id);
      expect(allCodex[1].id).toBe(codex1.id);
    });

    it('should return empty array when no codex exist', async () => {
      const result = await codexRepository.findAll();
      expect(result).toEqual([]);
    });
  });

  describe('database constraints', () => {
    it('should enforce unique codex IDs', async () => {
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
        changeSummary: 'Unique codex',
        isActive: true
      });

      // Try to create a codex with the same ID directly via connection
      await expect(
        connection.executeWrite(
          'CREATE (c:Codex {id: $id, version: "v2.0", starshipId: "other-ship"})',
          { id: codex.id }
        )
      ).rejects.toThrow();
    });
  });
});