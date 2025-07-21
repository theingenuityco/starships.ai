"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="jest" />
const MCPServerConnectorRepository_1 = require("../../src/repositories/MCPServerConnectorRepository");
const StarshipRepository_1 = require("../../src/repositories/StarshipRepository");
const types_1 = require("../../src/types");
const connection_1 = require("../../src/connection");
// Mock the connection module
jest.mock('../../src/connection');
describe('Validation and Constraint Tests', () => {
    let mcpConnectorRepo;
    let starshipRepo;
    let mockConnection;
    beforeEach(() => {
        jest.clearAllMocks();
        mcpConnectorRepo = new MCPServerConnectorRepository_1.MCPServerConnectorRepository();
        starshipRepo = new StarshipRepository_1.StarshipRepository();
        mockConnection = {
            executeQuery: jest.fn(),
            executeWrite: jest.fn(),
        };
        connection_1.getConnection.mockReturnValue(mockConnection);
    });
    describe('MCPServerConnectorRepository Validation', () => {
        describe('UUID Validation', () => {
            it('should throw ValidationError for invalid UUID in findById', async () => {
                await expect(mcpConnectorRepo.findById('invalid-uuid')).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.findById('invalid-uuid')).rejects.toThrow('id must be a valid UUID format');
            });
            it('should throw ValidationError for empty ID in findById', async () => {
                await expect(mcpConnectorRepo.findById('')).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.findById('')).rejects.toThrow('id is required and must be a string');
            });
            it('should accept valid UUID in findById', async () => {
                const validUUID = '123e4567-e89b-12d3-a456-426614174000';
                mockConnection.executeQuery.mockResolvedValue([]);
                await expect(mcpConnectorRepo.findById(validUUID)).resolves.toBeNull();
                expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (c:MCPServerConnector) WHERE c.id = $id RETURN c', { id: validUUID });
            });
        });
        describe('Create Method Validation', () => {
            it('should throw ValidationError for missing starshipId', async () => {
                await expect(mcpConnectorRepo.create({ templateId: '123e4567-e89b-12d3-a456-426614174000' })).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.create({ templateId: '123e4567-e89b-12d3-a456-426614174000' })).rejects.toThrow('starshipId is required');
            });
            it('should throw ValidationError for missing templateId', async () => {
                await expect(mcpConnectorRepo.create({ starshipId: '123e4567-e89b-12d3-a456-426614174000' })).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.create({ starshipId: '123e4567-e89b-12d3-a456-426614174000' })).rejects.toThrow('templateId is required');
            });
            it('should throw ValidationError for invalid starshipId UUID', async () => {
                await expect(mcpConnectorRepo.create({
                    starshipId: 'invalid-uuid',
                    templateId: '123e4567-e89b-12d3-a456-426614174000',
                })).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.create({
                    starshipId: 'invalid-uuid',
                    templateId: '123e4567-e89b-12d3-a456-426614174000',
                })).rejects.toThrow('starshipId must be a valid UUID format');
            });
            it('should throw ValidationError for invalid templateId UUID', async () => {
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: 'invalid-uuid',
                })).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: 'invalid-uuid',
                })).rejects.toThrow('templateId must be a valid UUID format');
            });
            it('should throw ValidationError for invalid status', async () => {
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                    status: 'invalid-status',
                })).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                    status: 'invalid-status',
                })).rejects.toThrow('Status must be one of: active, inactive, error, connecting');
            });
            it('should throw ValidationError for invalid isActive type', async () => {
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                    isActive: 'true',
                })).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                    isActive: 'true',
                })).rejects.toThrow('isActive must be a boolean value');
            });
            it('should throw NotFoundError when starship does not exist', async () => {
                mockConnection.executeQuery.mockResolvedValue([{ starshipExists: 0, templateExists: 1 }]);
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                })).rejects.toThrow(types_1.NotFoundError);
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                })).rejects.toThrow('Starship with ID 123e4567-e89b-12d3-a456-426614174000 not found');
            });
            it('should throw NotFoundError when template does not exist', async () => {
                mockConnection.executeQuery.mockResolvedValue([{ starshipExists: 1, templateExists: 0 }]);
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                })).rejects.toThrow(types_1.NotFoundError);
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                })).rejects.toThrow('MCP Server template with ID 123e4567-e89b-12d3-a456-426614174001 not found');
            });
            it('should throw ConstraintViolationError when connector already exists', async () => {
                mockConnection.executeQuery.mockResolvedValue([{ starshipExists: 1, templateExists: 1 }]);
                const existingConnector = {
                    id: 'existing-connector',
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                    status: 'active',
                    isActive: true,
                    connectedAt: '2024-01-01T00:00:00.000Z',
                    createdAt: '2024-01-01T00:00:00.000Z',
                    updatedAt: '2024-01-01T00:00:00.000Z',
                };
                jest
                    .spyOn(mcpConnectorRepo, 'findByStarshipAndTemplate')
                    .mockResolvedValue(existingConnector);
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                })).rejects.toThrow(types_1.ConstraintViolationError);
                await expect(mcpConnectorRepo.create({
                    starshipId: '123e4567-e89b-12d3-a456-426614174000',
                    templateId: '123e4567-e89b-12d3-a456-426614174001',
                })).rejects.toThrow('Only one connector instance per template is allowed per starship');
            });
        });
        describe('Update Method Validation', () => {
            it('should throw ValidationError for invalid UUID in update', async () => {
                await expect(mcpConnectorRepo.update('invalid-uuid', { status: 'active' })).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.update('invalid-uuid', { status: 'active' })).rejects.toThrow('id must be a valid UUID format');
            });
            it('should throw ValidationError for empty update data', async () => {
                const validUUID = '123e4567-e89b-12d3-a456-426614174000';
                await expect(mcpConnectorRepo.update(validUUID, {})).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.update(validUUID, {})).rejects.toThrow('Update data is required and cannot be empty');
            });
            it('should throw ValidationError for invalid status in update', async () => {
                const validUUID = '123e4567-e89b-12d3-a456-426614174000';
                await expect(mcpConnectorRepo.update(validUUID, { status: 'invalid-status' })).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.update(validUUID, { status: 'invalid-status' })).rejects.toThrow('Status must be one of: active, inactive, error, connecting');
            });
            it('should throw ValidationError for invalid isActive type in update', async () => {
                const validUUID = '123e4567-e89b-12d3-a456-426614174000';
                await expect(mcpConnectorRepo.update(validUUID, { isActive: 'false' })).rejects.toThrow(types_1.ValidationError);
                await expect(mcpConnectorRepo.update(validUUID, { isActive: 'false' })).rejects.toThrow('isActive must be a boolean value');
            });
        });
    });
    describe('StarshipRepository Validation', () => {
        describe('createConnectorInstance Method Validation', () => {
            it('should throw ValidationError for invalid starshipId UUID', async () => {
                await expect(starshipRepo.createConnectorInstance('invalid-uuid', '123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow(types_1.ValidationError);
                await expect(starshipRepo.createConnectorInstance('invalid-uuid', '123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow('starshipId must be a valid UUID format');
            });
            it('should throw ValidationError for invalid templateId UUID', async () => {
                await expect(starshipRepo.createConnectorInstance('123e4567-e89b-12d3-a456-426614174000', 'invalid-uuid')).rejects.toThrow(types_1.ValidationError);
                await expect(starshipRepo.createConnectorInstance('123e4567-e89b-12d3-a456-426614174000', 'invalid-uuid')).rejects.toThrow('templateId must be a valid UUID format');
            });
            it('should throw NotFoundError when starship does not exist', async () => {
                const validStarshipId = '123e4567-e89b-12d3-a456-426614174000';
                const validTemplateId = '123e4567-e89b-12d3-a456-426614174001';
                jest.spyOn(starshipRepo, 'findById').mockResolvedValue(null);
                await expect(starshipRepo.createConnectorInstance(validStarshipId, validTemplateId)).rejects.toThrow(types_1.NotFoundError);
                await expect(starshipRepo.createConnectorInstance(validStarshipId, validTemplateId)).rejects.toThrow(`Starship with ID ${validStarshipId} not found`);
            });
        });
        describe('removeConnectorInstance Method Validation', () => {
            it('should throw ValidationError for invalid starshipId UUID', async () => {
                await expect(starshipRepo.removeConnectorInstance('invalid-uuid', '123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow(types_1.ValidationError);
                await expect(starshipRepo.removeConnectorInstance('invalid-uuid', '123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow('starshipId must be a valid UUID format');
            });
            it('should throw ValidationError for invalid connectorId UUID', async () => {
                await expect(starshipRepo.removeConnectorInstance('123e4567-e89b-12d3-a456-426614174000', 'invalid-uuid')).rejects.toThrow(types_1.ValidationError);
                await expect(starshipRepo.removeConnectorInstance('123e4567-e89b-12d3-a456-426614174000', 'invalid-uuid')).rejects.toThrow('connectorId must be a valid UUID format');
            });
        });
    });
    describe('Error Type Validation', () => {
        it('should create ValidationError with correct properties', () => {
            const error = new types_1.ValidationError('Test message', 'testField');
            expect(error.name).toBe('ValidationError');
            expect(error.message).toBe('Test message');
            expect(error.field).toBe('testField');
            expect(error instanceof Error).toBe(true);
        });
        it('should create ConstraintViolationError with correct properties', () => {
            const error = new types_1.ConstraintViolationError('Test constraint violation', 'unique');
            expect(error.name).toBe('ConstraintViolationError');
            expect(error.message).toBe('Test constraint violation');
            expect(error.constraintType).toBe('unique');
            expect(error instanceof Error).toBe(true);
        });
        it('should create NotFoundError with correct properties', () => {
            const error = new types_1.NotFoundError('Entity not found', 'Starship', 'test-id');
            expect(error.name).toBe('NotFoundError');
            expect(error.message).toBe('Entity not found');
            expect(error.entityType).toBe('Starship');
            expect(error.entityId).toBe('test-id');
            expect(error instanceof Error).toBe(true);
        });
    });
});
//# sourceMappingURL=ValidationConstraints.test.js.map