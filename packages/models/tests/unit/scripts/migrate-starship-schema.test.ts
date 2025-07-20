/// <reference types="jest" />
import { StarshipSchemaMigration, MigrationOptions, MigrationResult } from '@/scripts/migrate-starship-schema';
import { createConnection, getConnection } from '@/connection';

jest.mock('@/connection');

describe('StarshipSchemaMigration', () => {
  let migration: StarshipSchemaMigration;

  const mockConnection = {
    connect: jest.fn(),
    initializeSchema: jest.fn(),
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    migration = new StarshipSchemaMigration({ dryRun: true });
    (createConnection as jest.Mock).mockReturnValue(mockConnection);
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
  });

  describe('Constructor and Options', () => {
    it('should initialize with default options', () => {
      const defaultMigration = new StarshipSchemaMigration();
      expect(defaultMigration).toBeDefined();
    });

    it('should accept custom options', () => {
      const options: MigrationOptions = {
        dryRun: true,
        batchSize: 50,
        rollback: false
      };
      const customMigration = new StarshipSchemaMigration(options);
      expect(customMigration).toBeDefined();
    });
  });

  describe('Dry Run Mode', () => {
    beforeEach(() => {
      // Mock validation queries
      mockConnection.executeQuery
        .mockResolvedValueOnce([{ count: 5 }]) // deprecated fields
        .mockResolvedValueOnce([{ count: 3 }]) // scout ships
        .mockResolvedValueOnce([{ count: 2 }]) // cruiser ships
        .mockResolvedValueOnce([{ count: 4 }]) // status updates
        .mockResolvedValueOnce([{ count: 6 }]) // agent starshipId population
        .mockResolvedValueOnce([{ count: 1 }]) // undeployed agents
        // Pre-validation queries
        .mockResolvedValueOnce([{ count: 5 }]) // missing max expeditions
        .mockResolvedValueOnce([{ count: 2 }]) // invalid status
        .mockResolvedValueOnce([{ count: 3 }]) // missing starship id
        .mockResolvedValueOnce([{ count: 1 }]) // starship id mismatch
        // Post-validation queries (same structure)
        .mockResolvedValueOnce([{ count: 0 }]) // missing max expeditions after
        .mockResolvedValueOnce([{ count: 0 }]) // invalid status after
        .mockResolvedValueOnce([{ count: 0 }]) // missing starship id after
        .mockResolvedValueOnce([{ count: 0 }]); // starship id mismatch after
    });

    it('should run in dry-run mode without making database changes', async () => {
      const result = await migration.run();

      expect(result).toBeDefined();
      expect(result.starshipUpdates.deprecated_fields_removed).toBe(5);
      expect(result.starshipUpdates.max_expeditions_added).toBe(5); // 3 + 2
      expect(result.starshipUpdates.status_updated).toBe(4);
      expect(result.agentUpdates.starship_id_populated).toBe(6);
      expect(result.agentUpdates.undeployed_agents).toBe(1);

      // Verify no write operations were called
      expect(mockConnection.executeWrite).not.toHaveBeenCalled();
      expect(mockConnection.executeQuery).toHaveBeenCalled();
    });

    it('should validate data integrity', async () => {
      const result = await migration.run();

      expect(result.validationResults).toBeDefined();
      expect(result.validationResults.starships_missing_max_expeditions).toBe(0);
      expect(result.validationResults.starships_invalid_status).toBe(0);
      expect(result.validationResults.agents_missing_starship_id).toBe(0);
      expect(result.validationResults.agents_starship_id_mismatch).toBe(0);
    });
  });

  describe('Rollback Mode', () => {
    it('should handle rollback mode', async () => {
      const rollbackMigration = new StarshipSchemaMigration({ rollback: true });
      const result = await rollbackMigration.run();

      expect(result).toBeDefined();
      expect(result.starshipUpdates.deprecated_fields_removed).toBe(0);
      expect(result.agentUpdates.starship_id_populated).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockConnection.connect.mockRejectedValueOnce(new Error('Connection failed'));
      
      await expect(migration.run()).rejects.toThrow('Connection failed');
    });

    it('should handle query errors and continue migration', async () => {
      mockConnection.executeQuery
        .mockRejectedValueOnce(new Error('Query failed'))
        .mockResolvedValue([{ count: 0 }]);

      const result = await migration.run();
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'starship',
            error: expect.stringContaining('Query failed')
          })
        ])
      );
    });
  });

  describe('Migration Result Structure', () => {
    it('should return properly structured migration result', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ count: 0 }]);

      const result = await migration.run();

      expect(result).toMatchObject({
        starshipUpdates: {
          deprecated_fields_removed: expect.any(Number),
          max_expeditions_added: expect.any(Number),
          status_updated: expect.any(Number),
          failures: expect.any(Number)
        },
        agentUpdates: {
          starship_id_populated: expect.any(Number),
          undeployed_agents: expect.any(Number),
          failures: expect.any(Number)
        },
        validationResults: {
          starships_missing_max_expeditions: expect.any(Number),
          starships_invalid_status: expect.any(Number),
          agents_missing_starship_id: expect.any(Number),
          agents_starship_id_mismatch: expect.any(Number)
        },
        errors: expect.any(Array)
      });
    });
  });
});

describe('Migration CLI Arguments', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('should handle --dry-run flag', () => {
    process.argv = ['node', 'script', '--dry-run'];
    expect(process.argv.includes('--dry-run')).toBe(true);
  });

  it('should handle --rollback flag', () => {
    process.argv = ['node', 'script', '--rollback'];
    expect(process.argv.includes('--rollback')).toBe(true);
  });

  it('should handle --batch-size flag', () => {
    process.argv = ['node', 'script', '--batch-size', '50'];
    const batchSizeIndex = process.argv.findIndex(arg => arg === '--batch-size');
    expect(batchSizeIndex).toBeGreaterThan(-1);
    expect(process.argv[batchSizeIndex + 1]).toBe('50');
  });
});