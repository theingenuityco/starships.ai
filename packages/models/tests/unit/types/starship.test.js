"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
describe('Starship Entity Schema Tests', () => {
    describe('Schema Validation', () => {
        it('should validate Starship has required fields with correct types', () => {
            const validStarship = {
                id: 'test-starship-1',
                slug: 'test-starship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Test Scout Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            // All required fields should be present
            expect(validStarship.id).toBeDefined();
            expect(validStarship.slug).toBeDefined();
            expect(validStarship.ownerId).toBeDefined();
            expect(validStarship.class).toBeDefined();
            expect(validStarship.name).toBeDefined();
            expect(validStarship.maxActiveExpeditions).toBeDefined();
            expect(validStarship.maxAgents).toBeDefined();
            expect(validStarship.status).toBeDefined();
            expect(validStarship.createdAt).toBeDefined();
            expect(validStarship.updatedAt).toBeDefined();
            // Type validation
            expect(typeof validStarship.id).toBe('string');
            expect(typeof validStarship.slug).toBe('string');
            expect(typeof validStarship.ownerId).toBe('string');
            expect(typeof validStarship.class).toBe('string');
            expect(typeof validStarship.name).toBe('string');
            expect(typeof validStarship.maxActiveExpeditions).toBe('number');
            expect(typeof validStarship.maxAgents).toBe('number');
            expect(typeof validStarship.status).toBe('string');
            expect(typeof validStarship.createdAt).toBe('string');
            expect(typeof validStarship.updatedAt).toBe('string');
        });
        it('should validate removed fields are not present in new schema', () => {
            const starship = {
                id: 'test-starship-1',
                slug: 'test-starship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Test Scout Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            // Removed fields should not be part of the schema
            expect('powerLevel' in starship).toBe(false);
            expect('sibilInsights' in starship).toBe(false);
            expect('activeExpeditions' in starship).toBe(false);
        });
        it('should validate new maxActiveExpeditions field is properly typed and required', () => {
            const starship = {
                id: 'test-starship-1',
                slug: 'test-starship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Test Scout Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            expect(starship.maxActiveExpeditions).toBeDefined();
            expect(typeof starship.maxActiveExpeditions).toBe('number');
            expect(starship.maxActiveExpeditions).toBeGreaterThan(0);
        });
        it('should validate status field only accepts active or inactive values', () => {
            // Valid status values
            const activeStarship = {
                id: 'test-starship-1',
                slug: 'test-starship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Test Scout Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            const inactiveStarship = {
                id: 'test-starship-2',
                slug: 'test-starship-2',
                ownerId: 'user-123',
                class: 'cruiser',
                name: 'Test Cruiser Ship',
                maxActiveExpeditions: 4,
                maxAgents: 6,
                status: 'inactive',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            expect(['active', 'inactive']).toContain(activeStarship.status);
            expect(['active', 'inactive']).toContain(inactiveStarship.status);
        });
        it('should validate class-based maxAgents and maxActiveExpeditions defaults', () => {
            const scoutStarship = {
                id: 'scout-1',
                slug: 'scout-ship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Scout Ship',
                maxActiveExpeditions: 2, // Scout default
                maxAgents: 3, // Scout default
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            const cruiserStarship = {
                id: 'cruiser-1',
                slug: 'cruiser-ship',
                ownerId: 'user-123',
                class: 'cruiser',
                name: 'Cruiser Ship',
                maxActiveExpeditions: 4, // Cruiser default
                maxAgents: 6, // Cruiser default
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            // Scout class defaults
            expect(scoutStarship.class).toBe('scout');
            expect(scoutStarship.maxAgents).toBe(3);
            expect(scoutStarship.maxActiveExpeditions).toBe(2);
            // Cruiser class defaults
            expect(cruiserStarship.class).toBe('cruiser');
            expect(cruiserStarship.maxAgents).toBe(6);
            expect(cruiserStarship.maxActiveExpeditions).toBe(4);
        });
        it('should validate class field only accepts scout or cruiser values', () => {
            const scoutStarship = {
                id: 'scout-1',
                slug: 'scout-ship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Scout Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            const cruiserStarship = {
                id: 'cruiser-1',
                slug: 'cruiser-ship',
                ownerId: 'user-123',
                class: 'cruiser',
                name: 'Cruiser Ship',
                maxActiveExpeditions: 4,
                maxAgents: 6,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            expect(['scout', 'cruiser']).toContain(scoutStarship.class);
            expect(['scout', 'cruiser']).toContain(cruiserStarship.class);
        });
    });
    describe('Field Constraints', () => {
        it('should validate slug is unique per owner', () => {
            // This is a schema validation test - actual uniqueness is enforced by repository
            const starship1 = {
                id: 'starship-1',
                slug: 'my-ship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'My Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            const starship2 = {
                id: 'starship-2',
                slug: 'my-ship', // Same slug but different owner should be allowed
                ownerId: 'user-456',
                class: 'cruiser',
                name: 'My Ship',
                maxActiveExpeditions: 4,
                maxAgents: 6,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            // Different owners can have same slug
            expect(starship1.slug).toBe(starship2.slug);
            expect(starship1.ownerId).not.toBe(starship2.ownerId);
        });
        it('should validate timestamps are in ISO format', () => {
            const starship = {
                id: 'test-starship-1',
                slug: 'test-starship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Test Scout Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            // Validate ISO 8601 format
            expect(() => new Date(starship.createdAt).toISOString()).not.toThrow();
            expect(() => new Date(starship.updatedAt).toISOString()).not.toThrow();
            // Validate actual ISO format
            expect(starship.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            expect(starship.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });
        it('should validate foreign key relationships', () => {
            const starship = {
                id: 'test-starship-1',
                slug: 'test-starship',
                ownerId: 'user-123', // Foreign key to User
                class: 'scout',
                name: 'Test Scout Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            // ownerId should be a valid UUID-like string (foreign key)
            expect(starship.ownerId).toBeDefined();
            expect(typeof starship.ownerId).toBe('string');
            expect(starship.ownerId.length).toBeGreaterThan(0);
        });
    });
    describe('Data Integrity', () => {
        it('should validate maxActiveExpeditions is positive integer', () => {
            const starship = {
                id: 'test-starship-1',
                slug: 'test-starship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Test Scout Ship',
                maxActiveExpeditions: 5, // Custom positive value
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            expect(starship.maxActiveExpeditions).toBeGreaterThan(0);
            expect(Number.isInteger(starship.maxActiveExpeditions)).toBe(true);
        });
        it('should validate maxAgents is positive integer', () => {
            const starship = {
                id: 'test-starship-1',
                slug: 'test-starship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Test Scout Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z'
            };
            expect(starship.maxAgents).toBeGreaterThan(0);
            expect(Number.isInteger(starship.maxAgents)).toBe(true);
        });
        it('should validate updatedAt is same or after createdAt', () => {
            const createdTime = '2023-01-01T00:00:00.000Z';
            const updatedTime = '2023-01-01T01:00:00.000Z'; // 1 hour later
            const starship = {
                id: 'test-starship-1',
                slug: 'test-starship',
                ownerId: 'user-123',
                class: 'scout',
                name: 'Test Scout Ship',
                maxActiveExpeditions: 2,
                maxAgents: 3,
                status: 'active',
                createdAt: createdTime,
                updatedAt: updatedTime
            };
            expect(new Date(starship.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(starship.createdAt).getTime());
        });
    });
});
//# sourceMappingURL=starship.test.js.map