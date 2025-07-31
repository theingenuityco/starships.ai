"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ExpeditionRepository_1 = require("@/repositories/ExpeditionRepository");
const StarshipRepository_1 = require("@/repositories/StarshipRepository");
const UserRepository_1 = require("@/repositories/UserRepository");
const connection_1 = require("@/connection");
describe('ExpeditionRepository Integration Tests', () => {
    let expeditionRepository;
    let starshipRepository;
    let userRepository;
    let connection;
    beforeEach(async () => {
        console.log('🔧 Setting up ExpeditionRepository integration test...');
        connection = (0, connection_1.getConnection)();
        expeditionRepository = new ExpeditionRepository_1.ExpeditionRepository();
        starshipRepository = new StarshipRepository_1.StarshipRepository();
        userRepository = new UserRepository_1.UserRepository();
        // Clean up any existing test data
        await connection.executeWrite('MATCH (n) DETACH DELETE n');
        console.log('✅ Test database cleaned');
    });
    describe('Database Connection Validation', () => {
        it('should connect to Neo4j successfully', async () => {
            console.log('🔍 Testing database connection...');
            const result = await connection.executeQuery('RETURN 1 as test');
            expect(result).toHaveLength(1);
            expect(result[0].test).toBe(1);
            console.log('✅ Database connection validated');
        });
    });
    describe('create()', () => {
        it('should create expedition with proper relationships', async () => {
            console.log('🚀 Testing expedition creation...');
            // Create test user and starship
            const user = await userRepository.create({
                username: 'expedition-captain',
                email: 'captain@expedition.test',
                displayName: 'Expedition Captain'
            });
            console.log(`✅ Created test user: ${user.id}`);
            const starship = await starshipRepository.create({
                ownerId: user.id,
                name: 'Test Expedition Ship',
                class: 'scout',
                powerLevel: 85,
                activeExpeditions: 0,
                sibilInsights: 0,
                status: 'active'
            });
            console.log(`✅ Created test starship: ${starship.id}`);
            const expeditionData = {
                starshipId: starship.id,
                title: 'Test Expedition',
                description: 'A test expedition for integration testing',
                objective: 'Validate expedition creation workflow',
                status: 'planning',
                participants: [user.id]
            };
            console.log('🔄 Creating expedition...');
            const expedition = await expeditionRepository.create(expeditionData);
            // Validate expedition properties
            expect(expedition.id).toBeDefined();
            expect(expedition.title).toBe(expeditionData.title);
            expect(expedition.status).toBe('planning');
            expect(expedition.starshipId).toBe(starship.id);
            expect(expedition.createdAt).toBeDefined();
            console.log(`✅ Expedition created successfully: ${expedition.id}`);
            // Validate database relationships
            console.log('🔍 Validating database relationships...');
            const relationshipCheck = await connection.executeQuery(`MATCH (e:Expedition {id: $expeditionId})-[r:BELONGS_TO]->(s:Starship {id: $starshipId})
         RETURN r`, { expeditionId: expedition.id, starshipId: starship.id });
            expect(relationshipCheck).toHaveLength(1);
            console.log('✅ Expedition-Starship relationship validated');
            const participantCheck = await connection.executeQuery(`MATCH (u:User {id: $userId})-[r:PARTICIPATES_IN]->(e:Expedition {id: $expeditionId})
         RETURN r`, { userId: user.id, expeditionId: expedition.id });
            expect(participantCheck).toHaveLength(1);
            console.log('✅ User-Expedition participation relationship validated');
        });
        it('should handle expedition creation errors gracefully', async () => {
            console.log('🔍 Testing expedition creation error handling...');
            const invalidExpeditionData = {
                starshipId: 'nonexistent-starship',
                title: 'Invalid Expedition',
                description: 'This should fail',
                objective: 'Test error handling',
                status: 'planning',
                participants: ['nonexistent-user']
            };
            console.log('🔄 Attempting to create expedition with invalid data...');
            await expect(expeditionRepository.create(invalidExpeditionData)).rejects.toThrow();
            console.log('✅ Error handling validated - invalid expedition creation properly rejected');
        });
    });
    describe('findById()', () => {
        it('should retrieve expedition with all relationships', async () => {
            console.log('🔍 Testing expedition retrieval...');
            // Setup test data
            const user = await userRepository.create({
                username: 'retrieval-test',
                email: 'retrieval@test.com',
                displayName: 'Retrieval Test'
            });
            const starship = await starshipRepository.create({
                ownerId: user.id,
                name: 'Retrieval Test Ship',
                class: 'cruiser',
                powerLevel: 95,
                activeExpeditions: 0,
                sibilInsights: 0,
                status: 'active'
            });
            const expedition = await expeditionRepository.create({
                starshipId: starship.id,
                title: 'Retrieval Test Expedition',
                description: 'Testing expedition retrieval',
                objective: 'Validate data retrieval',
                status: 'planning',
                participants: [user.id]
            });
            console.log(`✅ Test expedition created: ${expedition.id}`);
            console.log('🔄 Retrieving expedition by ID...');
            const retrievedExpedition = await expeditionRepository.findById(expedition.id);
            expect(retrievedExpedition).not.toBeNull();
            expect(retrievedExpedition?.id).toBe(expedition.id);
            expect(retrievedExpedition?.title).toBe(expedition.title);
            expect(retrievedExpedition?.starshipId).toBe(starship.id);
            console.log('✅ Expedition retrieval validated');
        });
    });
    describe('updateStatus()', () => {
        it('should update expedition status and track transitions', async () => {
            console.log('🔄 Testing expedition status updates...');
            // Setup test data
            const user = await userRepository.create({
                username: 'status-test',
                email: 'status@test.com',
                displayName: 'Status Test'
            });
            const starship = await starshipRepository.create({
                ownerId: user.id,
                name: 'Status Test Ship',
                class: 'scout',
                powerLevel: 80,
                activeExpeditions: 0,
                sibilInsights: 0,
                status: 'active'
            });
            const expedition = await expeditionRepository.create({
                starshipId: starship.id,
                title: 'Status Test Expedition',
                description: 'Testing status transitions',
                objective: 'Validate status updates',
                status: 'planning',
                participants: [user.id]
            });
            console.log(`🔄 Updating expedition status from planning to active...`);
            const updatedExpedition = await expeditionRepository.updateStatus(expedition.id, 'active');
            expect(updatedExpedition).not.toBeNull();
            expect(updatedExpedition?.status).toBe('active');
            expect(updatedExpedition?.updatedAt).not.toBe(expedition.updatedAt);
            console.log('✅ Status update validated');
            // Test invalid status transition
            console.log('🔍 Testing invalid status transition...');
            await expect(expeditionRepository.updateStatus(expedition.id, 'invalid-status')).rejects.toThrow();
            console.log('✅ Invalid status transition properly rejected');
        });
    });
    describe('Performance and Scalability', () => {
        it('should handle multiple expeditions efficiently', async () => {
            console.log('⚡ Testing expedition repository performance...');
            const user = await userRepository.create({
                username: 'perf-test',
                email: 'perf@test.com',
                displayName: 'Performance Test'
            });
            const starship = await starshipRepository.create({
                ownerId: user.id,
                name: 'Performance Test Ship',
                class: 'cruiser',
                powerLevel: 90,
                activeExpeditions: 0,
                sibilInsights: 0,
                status: 'active'
            });
            const startTime = Date.now();
            const expeditions = [];
            console.log('🔄 Creating 10 expeditions for performance test...');
            for (let i = 1; i <= 10; i++) {
                const expedition = await expeditionRepository.create({
                    starshipId: starship.id,
                    title: `Performance Test Expedition ${i}`,
                    description: `Performance test expedition number ${i}`,
                    objective: `Test objective ${i}`,
                    status: 'planning',
                    participants: [user.id]
                });
                expeditions.push(expedition);
            }
            const creationTime = Date.now() - startTime;
            console.log(`✅ Created 10 expeditions in ${creationTime}ms`);
            // Test bulk retrieval
            const retrievalStart = Date.now();
            const retrievedExpeditions = await expeditionRepository.findByStarship(starship.id);
            const retrievalTime = Date.now() - retrievalStart;
            expect(retrievedExpeditions).toHaveLength(10);
            console.log(`✅ Retrieved 10 expeditions in ${retrievalTime}ms`);
            console.log(`⚡ Performance test completed - Total time: ${creationTime + retrievalTime}ms`);
        });
    });
});
//# sourceMappingURL=expedition-repository.test.js.map