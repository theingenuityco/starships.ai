"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const LLMRepository_1 = require("@/repositories/LLMRepository");
const connection_1 = require("@/connection");
describe('LLMRepository Integration Tests', () => {
    let llmRepository;
    let connection;
    beforeEach(async () => {
        connection = (0, connection_1.getConnection)();
        llmRepository = new LLMRepository_1.LLMRepository();
        // Clean up any existing test data
        await connection.executeWrite('MATCH (n) DETACH DELETE n');
    });
    describe('create()', () => {
        it('should create LLM with all fields', async () => {
            const llmData = {
                name: 'GPT-4',
                provider: 'openai',
                maxTokens: 8192,
                temperature: 0.7,
                embeddingModel: 'text-embedding-ada-002',
                supportsStreaming: true,
                supportsTools: true,
                costPer1kTokens: 0.03,
                createdAt: new Date().toISOString()
            };
            const result = await llmRepository.create(llmData);
            expect(result.id).toBeDefined();
            expect(result.id).toMatch(/^test-uuid-\d+$/);
            expect(result.name).toBe(llmData.name);
            expect(result.provider).toBe(llmData.provider);
            expect(result.maxTokens).toBe(llmData.maxTokens);
            expect(result.temperature).toBe(llmData.temperature);
            expect(result.embeddingModel).toBe(llmData.embeddingModel);
            expect(result.supportsStreaming).toBe(llmData.supportsStreaming);
            expect(result.supportsTools).toBe(llmData.supportsTools);
            expect(result.costPer1kTokens).toBe(llmData.costPer1kTokens);
            // Verify it was actually saved to the database
            const savedLLM = await llmRepository.findById(result.id);
            expect(savedLLM).not.toBeNull();
            expect(savedLLM?.name).toBe(llmData.name);
        });
        it('should create LLM with minimal required fields', async () => {
            const llmData = {
                name: 'Claude-3',
                provider: 'anthropic',
                createdAt: new Date().toISOString()
            };
            const result = await llmRepository.create(llmData);
            expect(result.id).toBeDefined();
            expect(result.name).toBe(llmData.name);
            expect(result.provider).toBe(llmData.provider);
            expect(result.maxTokens).toBeUndefined();
            expect(result.temperature).toBeUndefined();
            expect(result.embeddingModel).toBeUndefined();
            expect(result.supportsStreaming).toBeUndefined();
            expect(result.supportsTools).toBeUndefined();
            expect(result.costPer1kTokens).toBeUndefined();
        });
        it('should create multiple LLMs with unique IDs', async () => {
            const llm1Data = {
                name: 'GPT-3.5 Turbo',
                provider: 'openai',
                createdAt: new Date().toISOString()
            };
            const llm2Data = {
                name: 'Claude-3 Sonnet',
                provider: 'anthropic',
                createdAt: new Date().toISOString()
            };
            const llm1 = await llmRepository.create(llm1Data);
            const llm2 = await llmRepository.create(llm2Data);
            expect(llm1.id).not.toBe(llm2.id);
            expect(llm1.name).toBe(llm1Data.name);
            expect(llm2.name).toBe(llm2Data.name);
        });
    });
    describe('findById()', () => {
        it('should return LLM when found', async () => {
            const llmData = {
                name: 'Findable LLM',
                provider: 'openai',
                maxTokens: 4096,
                temperature: 0.5,
                createdAt: new Date().toISOString()
            };
            const createdLLM = await llmRepository.create(llmData);
            const foundLLM = await llmRepository.findById(createdLLM.id);
            expect(foundLLM).not.toBeNull();
            expect(foundLLM?.id).toBe(createdLLM.id);
            expect(foundLLM?.name).toBe(llmData.name);
            expect(foundLLM?.provider).toBe(llmData.provider);
        });
        it('should return null when LLM not found', async () => {
            const result = await llmRepository.findById('nonexistent-id');
            expect(result).toBeNull();
        });
    });
    describe('findByProvider()', () => {
        it('should return LLMs filtered by provider', async () => {
            // Create OpenAI LLMs
            const openai1 = await llmRepository.create({
                name: 'GPT-4',
                provider: 'openai',
                createdAt: new Date().toISOString()
            });
            const openai2 = await llmRepository.create({
                name: 'GPT-3.5 Turbo',
                provider: 'openai',
                createdAt: new Date().toISOString()
            });
            // Create Anthropic LLM
            const anthropic1 = await llmRepository.create({
                name: 'Claude-3 Sonnet',
                provider: 'anthropic',
                createdAt: new Date().toISOString()
            });
            const openaiLLMs = await llmRepository.findByProvider('openai');
            const anthropicLLMs = await llmRepository.findByProvider('anthropic');
            expect(openaiLLMs).toHaveLength(2);
            expect(anthropicLLMs).toHaveLength(1);
            expect(openaiLLMs.map(l => l.id)).toContain(openai1.id);
            expect(openaiLLMs.map(l => l.id)).toContain(openai2.id);
            expect(anthropicLLMs.map(l => l.id)).toContain(anthropic1.id);
            // Should be ordered by name
            expect(openaiLLMs[0].name).toBe('GPT-3.5 Turbo');
            expect(openaiLLMs[1].name).toBe('GPT-4');
        });
        it('should return empty array when no LLMs found for provider', async () => {
            const result = await llmRepository.findByProvider('nonexistent');
            expect(result).toEqual([]);
        });
        it('should handle case sensitivity correctly', async () => {
            await llmRepository.create({
                name: 'Test LLM',
                provider: 'openai',
                createdAt: new Date().toISOString()
            });
            // Should find with exact case
            const exactMatch = await llmRepository.findByProvider('openai');
            expect(exactMatch).toHaveLength(1);
            // Should not find with different case
            const differentCase = await llmRepository.findByProvider('OpenAI');
            expect(differentCase).toHaveLength(0);
        });
    });
    describe('findAll()', () => {
        it('should return all LLMs ordered by name', async () => {
            const llm1 = await llmRepository.create({
                name: 'Zebra LLM',
                provider: 'openai',
                createdAt: new Date().toISOString()
            });
            const llm2 = await llmRepository.create({
                name: 'Alpha LLM',
                provider: 'anthropic',
                createdAt: new Date().toISOString()
            });
            const llm3 = await llmRepository.create({
                name: 'Beta LLM',
                provider: 'openai',
                createdAt: new Date().toISOString()
            });
            const allLLMs = await llmRepository.findAll();
            expect(allLLMs).toHaveLength(3);
            // Should be ordered by name ASC
            expect(allLLMs[0].name).toBe('Alpha LLM');
            expect(allLLMs[1].name).toBe('Beta LLM');
            expect(allLLMs[2].name).toBe('Zebra LLM');
        });
        it('should return empty array when no LLMs exist', async () => {
            const result = await llmRepository.findAll();
            expect(result).toEqual([]);
        });
    });
    describe('update()', () => {
        it('should update LLM properties', async () => {
            const llmData = {
                name: 'Original LLM',
                provider: 'openai',
                maxTokens: 4096,
                temperature: 0.7,
                supportsStreaming: false,
                createdAt: new Date().toISOString()
            };
            const createdLLM = await llmRepository.create(llmData);
            const updates = {
                name: 'Updated LLM',
                maxTokens: 8192,
                temperature: 0.5,
                supportsStreaming: true,
                costPer1kTokens: 0.02
            };
            const updatedLLM = await llmRepository.update(createdLLM.id, updates);
            expect(updatedLLM).not.toBeNull();
            expect(updatedLLM?.name).toBe(updates.name);
            expect(updatedLLM?.maxTokens).toBe(updates.maxTokens);
            expect(updatedLLM?.temperature).toBe(updates.temperature);
            expect(updatedLLM?.supportsStreaming).toBe(updates.supportsStreaming);
            expect(updatedLLM?.costPer1kTokens).toBe(updates.costPer1kTokens);
            expect(updatedLLM?.provider).toBe(llmData.provider); // Should remain unchanged
            expect(updatedLLM?.id).toBe(createdLLM.id);
        });
        it('should not update when no valid fields provided', async () => {
            const llmData = {
                name: 'No Change LLM',
                provider: 'openai',
                createdAt: new Date().toISOString()
            };
            const createdLLM = await llmRepository.create(llmData);
            // Try to update with only restricted fields
            const updatedLLM = await llmRepository.update(createdLLM.id, {
                id: 'new-id' // Should be ignored
            });
            expect(updatedLLM).not.toBeNull();
            expect(updatedLLM?.id).toBe(createdLLM.id); // Should remain unchanged
            expect(updatedLLM?.name).toBe(llmData.name);
        });
        it('should return null when updating non-existent LLM', async () => {
            const result = await llmRepository.update('nonexistent-id', {
                name: 'Updated Name'
            });
            expect(result).toBeNull();
        });
    });
    describe('delete()', () => {
        it('should delete LLM and return true on success', async () => {
            const llmData = {
                name: 'Deletable LLM',
                provider: 'anthropic',
                createdAt: new Date().toISOString()
            };
            const createdLLM = await llmRepository.create(llmData);
            const deleteResult = await llmRepository.delete(createdLLM.id);
            expect(deleteResult).toBe(true);
            // Verify it was actually deleted
            const foundLLM = await llmRepository.findById(createdLLM.id);
            expect(foundLLM).toBeNull();
        });
        it('should return false when LLM not found', async () => {
            const result = await llmRepository.delete('nonexistent-id');
            expect(result).toBe(false);
        });
    });
    describe('provider validation', () => {
        it('should handle valid providers correctly', async () => {
            const openaiLLM = await llmRepository.create({
                name: 'OpenAI LLM',
                provider: 'openai',
                createdAt: new Date().toISOString()
            });
            const anthropicLLM = await llmRepository.create({
                name: 'Anthropic LLM',
                provider: 'anthropic',
                createdAt: new Date().toISOString()
            });
            expect(openaiLLM.provider).toBe('openai');
            expect(anthropicLLM.provider).toBe('anthropic');
        });
    });
    describe('numeric field handling', () => {
        it('should handle zero and negative values correctly', async () => {
            const llmData = {
                name: 'Edge Case LLM',
                provider: 'openai',
                maxTokens: 0,
                temperature: 0,
                costPer1kTokens: 0,
                createdAt: new Date().toISOString()
            };
            const result = await llmRepository.create(llmData);
            expect(result.maxTokens).toBe(0);
            expect(result.temperature).toBe(0);
            expect(result.costPer1kTokens).toBe(0);
        });
        it('should handle decimal values correctly', async () => {
            const llmData = {
                name: 'Decimal LLM',
                provider: 'anthropic',
                temperature: 0.12345,
                costPer1kTokens: 0.00567,
                createdAt: new Date().toISOString()
            };
            const result = await llmRepository.create(llmData);
            expect(result.temperature).toBeCloseTo(0.12345, 5);
            expect(result.costPer1kTokens).toBeCloseTo(0.00567, 5);
        });
    });
    describe('boolean field handling', () => {
        it('should handle true/false values correctly', async () => {
            const llmData = {
                name: 'Boolean LLM',
                provider: 'openai',
                supportsStreaming: true,
                supportsTools: false,
                createdAt: new Date().toISOString()
            };
            const result = await llmRepository.create(llmData);
            expect(result.supportsStreaming).toBe(true);
            expect(result.supportsTools).toBe(false);
        });
    });
    describe('database constraints', () => {
        it('should enforce unique LLM IDs', async () => {
            const llm = await llmRepository.create({
                name: 'Unique LLM',
                provider: 'openai',
                createdAt: new Date().toISOString()
            });
            // Try to create an LLM with the same ID directly via connection
            await expect(connection.executeWrite('CREATE (l:LLM {id: $id, name: "Duplicate", provider: "anthropic"})', { id: llm.id })).rejects.toThrow();
        });
    });
    describe('complex scenarios', () => {
        it('should handle LLM with all optional fields as null/undefined', async () => {
            const llmData = {
                name: 'Minimal LLM',
                provider: 'anthropic',
                maxTokens: undefined,
                temperature: undefined,
                embeddingModel: undefined,
                supportsStreaming: undefined,
                supportsTools: undefined,
                costPer1kTokens: undefined,
                createdAt: new Date().toISOString()
            };
            const result = await llmRepository.create(llmData);
            expect(result.name).toBe(llmData.name);
            expect(result.provider).toBe(llmData.provider);
            expect(result.maxTokens).toBeUndefined();
            expect(result.temperature).toBeUndefined();
            expect(result.embeddingModel).toBeUndefined();
            expect(result.supportsStreaming).toBeUndefined();
            expect(result.supportsTools).toBeUndefined();
            expect(result.costPer1kTokens).toBeUndefined();
        });
        it('should update from undefined to defined values', async () => {
            const llmData = {
                name: 'Evolving LLM',
                provider: 'openai',
                createdAt: new Date().toISOString()
            };
            const createdLLM = await llmRepository.create(llmData);
            const updates = {
                maxTokens: 8192,
                temperature: 0.8,
                supportsStreaming: true,
                costPer1kTokens: 0.03
            };
            const updatedLLM = await llmRepository.update(createdLLM.id, updates);
            expect(updatedLLM?.maxTokens).toBe(8192);
            expect(updatedLLM?.temperature).toBe(0.8);
            expect(updatedLLM?.supportsStreaming).toBe(true);
            expect(updatedLLM?.costPer1kTokens).toBe(0.03);
        });
    });
});
//# sourceMappingURL=llm-repository.test.js.map