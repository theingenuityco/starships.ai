"use strict";
/**
 * Expedition Service - Business Logic Layer
 *
 * Handles all business logic for expedition management including CRUD operations,
 * validation, status transitions, and integration with First Officer Agent.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpeditionService = void 0;
const models_1 = require("@starships/models");
const FirstOfficerService_1 = require("./FirstOfficerService");
const SocketIOService_1 = require("./SocketIOService");
class ExpeditionService {
    constructor() {
        this.firstOfficerService = FirstOfficerService_1.FirstOfficerService.getInstance();
    }
    /**
     * Safely get SocketIOService instance with lazy initialization
     * Returns null if SocketIOService is not yet initialized
     */
    getSocketService() {
        try {
            return SocketIOService_1.SocketIOService.getInstance();
        }
        catch (error) {
            console.warn('[EXPEDITION-SERVICE] SocketIOService not yet initialized');
            return null;
        }
    }
    static getInstance() {
        if (!ExpeditionService.instance) {
            ExpeditionService.instance = new ExpeditionService();
        }
        return ExpeditionService.instance;
    }
    /**
     * Create a new expedition
     */
    async createExpedition(userId, request) {
        console.log(`[EXPEDITION-SERVICE] Creating expedition for starship: ${request.starshipId}`);
        try {
            // Validate starship ownership
            await this.validateStarshipOwnership(request.starshipId, userId);
            // Validate starship status
            await this.validateStarshipStatus(request.starshipId);
            // Create expedition
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const expedition = await expeditionRepo.create({
                starshipId: request.starshipId,
                title: request.title,
                description: request.description,
                objective: request.objective,
                status: 'draft',
                priority: request.priority || 'medium',
                assignedAgents: [],
                createdBy: userId,
                estimatedDuration: request.estimatedDuration,
                tags: request.tags || [],
                updatedAt: new Date().toISOString()
            });
            // Get assigned agents info
            const assignedAgents = await this.getAssignedAgentsInfo(expedition.assignedAgents);
            // Emit real-time event
            const socketService = this.getSocketService();
            if (socketService) {
                socketService.emitToUser(userId, 'expedition:created', {
                    expedition,
                    assignedAgents
                });
            }
            console.log(`[EXPEDITION-SERVICE] Expedition created: ${expedition.id}`);
            return {
                expedition,
                assignedAgents,
                tasks: [],
                messages: [],
                results: []
            };
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to create expedition:', error);
            throw this.handleError(error, 'CREATE_EXPEDITION_FAILED');
        }
    }
    /**
     * Get expedition by ID
     */
    async getExpedition(expeditionId, userId) {
        try {
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const expedition = await expeditionRepo.findById(expeditionId);
            if (!expedition) {
                throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
            }
            // Validate access
            await this.validateExpeditionAccess(expedition, userId);
            // Get related data
            const [tasks, messages, results, assignedAgents] = await Promise.all([
                this.getExpeditionTasks(expeditionId),
                this.getExpeditionMessages(expeditionId),
                this.getExpeditionResults(expeditionId),
                this.getAssignedAgentsInfo(expedition.assignedAgents)
            ]);
            return {
                expedition,
                tasks,
                messages,
                results,
                assignedAgents
            };
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to get expedition:', error);
            throw this.handleError(error, 'GET_EXPEDITION_FAILED');
        }
    }
    /**
     * Get expeditions for a starship
     */
    async getExpeditions(starshipId, userId, filters, sort, pagination) {
        try {
            // Validate starship ownership
            await this.validateStarshipOwnership(starshipId, userId);
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const { expeditions, total } = await expeditionRepo.findWithFilters(starshipId, filters || {}, sort, pagination);
            return {
                expeditions,
                total,
                page: pagination?.page || 1,
                limit: pagination?.limit || 20,
                filters
            };
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to get expeditions:', error);
            throw this.handleError(error, 'GET_EXPEDITIONS_FAILED');
        }
    }
    /**
     * Update expedition
     */
    async updateExpedition(expeditionId, userId, updates) {
        try {
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const expedition = await expeditionRepo.findById(expeditionId);
            if (!expedition) {
                throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
            }
            // Validate access and modification rights
            await this.validateExpeditionAccess(expedition, userId);
            this.validateExpeditionModification(expedition);
            // Update expedition
            const updatedExpedition = await expeditionRepo.update(expeditionId, updates);
            if (!updatedExpedition) {
                throw this.createError('UPDATE_FAILED', 'Failed to update expedition');
            }
            // Get updated data
            const [tasks, messages, results, assignedAgents] = await Promise.all([
                this.getExpeditionTasks(expeditionId),
                this.getExpeditionMessages(expeditionId),
                this.getExpeditionResults(expeditionId),
                this.getAssignedAgentsInfo(updatedExpedition.assignedAgents)
            ]);
            // Emit real-time event
            const socketService = this.getSocketService();
            if (socketService) {
                socketService.emitToUser(userId, 'expedition:updated', {
                    expedition: updatedExpedition,
                    assignedAgents
                });
            }
            return {
                expedition: updatedExpedition,
                tasks,
                messages,
                results,
                assignedAgents
            };
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to update expedition:', error);
            throw this.handleError(error, 'UPDATE_EXPEDITION_FAILED');
        }
    }
    /**
     * Delete expedition
     */
    async deleteExpedition(expeditionId, userId) {
        try {
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const expedition = await expeditionRepo.findById(expeditionId);
            if (!expedition) {
                throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
            }
            // Validate access and deletion rights
            await this.validateExpeditionAccess(expedition, userId);
            this.validateExpeditionDeletion(expedition);
            // Delete expedition and related data
            await this.deleteExpeditionData(expeditionId);
            // Emit real-time event
            const socketService = this.getSocketService();
            if (socketService) {
                socketService.emitToUser(userId, 'expedition:deleted', {
                    expeditionId
                });
            }
            console.log(`[EXPEDITION-SERVICE] Expedition deleted: ${expeditionId}`);
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to delete expedition:', error);
            throw this.handleError(error, 'DELETE_EXPEDITION_FAILED');
        }
    }
    /**
     * Start expedition
     */
    async startExpedition(expeditionId, userId) {
        try {
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const expedition = await expeditionRepo.findById(expeditionId);
            if (!expedition) {
                throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
            }
            // Validate access and start conditions
            await this.validateExpeditionAccess(expedition, userId);
            this.validateExpeditionStart(expedition);
            // Update status to planning
            const updatedExpedition = await expeditionRepo.updateStatus(expeditionId, 'planning');
            if (!updatedExpedition) {
                throw this.createError('STATUS_UPDATE_FAILED', 'Failed to update expedition status');
            }
            // Start First Officer orchestration
            await this.firstOfficerService.startExpedition(expeditionId, userId, expedition.objective);
            // Get updated data
            const [tasks, messages, results, assignedAgents] = await Promise.all([
                this.getExpeditionTasks(expeditionId),
                this.getExpeditionMessages(expeditionId),
                this.getExpeditionResults(expeditionId),
                this.getAssignedAgentsInfo(updatedExpedition.assignedAgents)
            ]);
            // Emit real-time event
            const socketService = this.getSocketService();
            if (socketService) {
                socketService.emitToUser(userId, 'expedition:started', {
                    expedition: updatedExpedition,
                    assignedAgents
                });
            }
            console.log(`[EXPEDITION-SERVICE] Expedition started: ${expeditionId}`);
            return {
                expedition: updatedExpedition,
                tasks,
                messages,
                results,
                assignedAgents
            };
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to start expedition:', error);
            throw this.handleError(error, 'START_EXPEDITION_FAILED');
        }
    }
    /**
     * Pause expedition
     */
    async pauseExpedition(expeditionId, userId) {
        try {
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const expedition = await expeditionRepo.findById(expeditionId);
            if (!expedition) {
                throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
            }
            // Validate access and pause conditions
            await this.validateExpeditionAccess(expedition, userId);
            this.validateExpeditionPause(expedition);
            // Pause First Officer orchestration
            await this.firstOfficerService.pauseExpedition(expeditionId);
            // Update status (First Officer will handle the actual status update)
            const updatedExpedition = await expeditionRepo.findById(expeditionId);
            // Get updated data
            const [tasks, messages, results, assignedAgents] = await Promise.all([
                this.getExpeditionTasks(expeditionId),
                this.getExpeditionMessages(expeditionId),
                this.getExpeditionResults(expeditionId),
                this.getAssignedAgentsInfo(updatedExpedition.assignedAgents)
            ]);
            // Emit real-time event
            const socketService = this.getSocketService();
            if (socketService) {
                socketService.emitToUser(userId, 'expedition:paused', {
                    expedition: updatedExpedition,
                    assignedAgents
                });
            }
            return {
                expedition: updatedExpedition,
                tasks,
                messages,
                results,
                assignedAgents
            };
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to pause expedition:', error);
            throw this.handleError(error, 'PAUSE_EXPEDITION_FAILED');
        }
    }
    /**
     * Resume expedition
     */
    async resumeExpedition(expeditionId, userId) {
        try {
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const expedition = await expeditionRepo.findById(expeditionId);
            if (!expedition) {
                throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
            }
            // Validate access and resume conditions
            await this.validateExpeditionAccess(expedition, userId);
            this.validateExpeditionResume(expedition);
            // Resume First Officer orchestration
            await this.firstOfficerService.resumeExpedition(expeditionId);
            // Get updated expedition
            const updatedExpedition = await expeditionRepo.findById(expeditionId);
            // Get updated data
            const [tasks, messages, results, assignedAgents] = await Promise.all([
                this.getExpeditionTasks(expeditionId),
                this.getExpeditionMessages(expeditionId),
                this.getExpeditionResults(expeditionId),
                this.getAssignedAgentsInfo(updatedExpedition.assignedAgents)
            ]);
            // Emit real-time event
            const socketService = this.getSocketService();
            if (socketService) {
                socketService.emitToUser(userId, 'expedition:resumed', {
                    expedition: updatedExpedition,
                    assignedAgents
                });
            }
            return {
                expedition: updatedExpedition,
                tasks,
                messages,
                results,
                assignedAgents
            };
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to resume expedition:', error);
            throw this.handleError(error, 'RESUME_EXPEDITION_FAILED');
        }
    }
    /**
     * Cancel expedition
     */
    async cancelExpedition(expeditionId, userId) {
        try {
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const expedition = await expeditionRepo.findById(expeditionId);
            if (!expedition) {
                throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
            }
            // Validate access and cancel conditions
            await this.validateExpeditionAccess(expedition, userId);
            this.validateExpeditionCancel(expedition);
            // Cancel First Officer orchestration
            await this.firstOfficerService.cancelExpedition(expeditionId);
            // Update status to cancelled
            await expeditionRepo.updateStatus(expeditionId, 'cancelled');
            // Emit real-time event
            const socketService = this.getSocketService();
            if (socketService) {
                socketService.emitToUser(userId, 'expedition:cancelled', {
                    expeditionId
                });
            }
            console.log(`[EXPEDITION-SERVICE] Expedition cancelled: ${expeditionId}`);
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to cancel expedition:', error);
            throw this.handleError(error, 'CANCEL_EXPEDITION_FAILED');
        }
    }
    /**
     * Get expedition statistics
     */
    async getExpeditionStats(starshipId, userId) {
        try {
            // Validate starship ownership
            await this.validateStarshipOwnership(starshipId, userId);
            const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
            const stats = await expeditionRepo.getExpeditionStats(starshipId);
            // Get top performing agents (placeholder implementation)
            const topPerformingAgents = await this.getTopPerformingAgents(starshipId);
            return {
                totalExpeditions: stats.total,
                activeExpeditions: stats.active,
                completedExpeditions: stats.completed,
                failedExpeditions: stats.failed,
                averageDuration: stats.averageDuration,
                successRate: stats.successRate,
                topPerformingAgents
            };
        }
        catch (error) {
            console.error('[EXPEDITION-SERVICE] Failed to get expedition stats:', error);
            throw this.handleError(error, 'GET_STATS_FAILED');
        }
    }
    // Private helper methods
    async validateStarshipOwnership(starshipId, userId) {
        const starshipRepo = models_1.RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepo.findById(starshipId);
        if (!starship) {
            throw this.createError('STARSHIP_NOT_FOUND', `Starship not found: ${starshipId}`);
        }
        if (starship.ownerId !== userId) {
            throw this.createError('EXPEDITION_ACCESS_DENIED', 'Access denied to starship');
        }
    }
    async validateStarshipStatus(starshipId) {
        const starshipRepo = models_1.RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepo.findById(starshipId);
        if (starship?.status === 'maintenance') {
            throw this.createError('STARSHIP_MAINTENANCE', 'Starship is in maintenance mode');
        }
    }
    async validateExpeditionAccess(expedition, userId) {
        const starshipRepo = models_1.RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepo.findById(expedition.starshipId);
        if (!starship || starship.ownerId !== userId) {
            throw this.createError('EXPEDITION_ACCESS_DENIED', 'Access denied to expedition');
        }
    }
    validateExpeditionModification(expedition) {
        if (['in-progress', 'completed', 'failed'].includes(expedition.status)) {
            throw this.createError('EXPEDITION_CANNOT_MODIFY', 'Cannot modify expedition in current status');
        }
    }
    validateExpeditionDeletion(expedition) {
        if (['in-progress', 'planning'].includes(expedition.status)) {
            throw this.createError('EXPEDITION_CANNOT_DELETE', 'Cannot delete active expedition');
        }
    }
    validateExpeditionStart(expedition) {
        if (expedition.status !== 'draft') {
            throw this.createError('INVALID_STATUS_TRANSITION', 'Expedition must be in draft status to start');
        }
    }
    validateExpeditionPause(expedition) {
        if (!['planning', 'in-progress'].includes(expedition.status)) {
            throw this.createError('INVALID_STATUS_TRANSITION', 'Can only pause active expeditions');
        }
    }
    validateExpeditionResume(expedition) {
        // Resume logic would check for paused state when implemented
        if (!['planning', 'in-progress'].includes(expedition.status)) {
            throw this.createError('INVALID_STATUS_TRANSITION', 'Invalid expedition status for resume');
        }
    }
    validateExpeditionCancel(expedition) {
        if (['completed', 'failed', 'cancelled'].includes(expedition.status)) {
            throw this.createError('INVALID_STATUS_TRANSITION', 'Cannot cancel expedition in current status');
        }
    }
    async getExpeditionTasks(expeditionId) {
        const taskRepo = models_1.RepositoryFactory.getExpeditionTaskRepository();
        return await taskRepo.findByExpedition(expeditionId);
    }
    async getExpeditionMessages(expeditionId) {
        const messageRepo = models_1.RepositoryFactory.getExpeditionMessageRepository();
        return await messageRepo.findByExpedition(expeditionId);
    }
    async getExpeditionResults(expeditionId) {
        const resultRepo = models_1.RepositoryFactory.getExpeditionResultRepository();
        return await resultRepo.findByExpedition(expeditionId);
    }
    async getAssignedAgentsInfo(agentIds) {
        if (agentIds.length === 0)
            return [];
        const agentRepo = models_1.RepositoryFactory.getAgentRepository();
        const agents = await Promise.all(agentIds.map(id => agentRepo.findById(id)));
        return agents
            .filter(agent => agent !== null)
            .map(agent => ({
            id: agent.id,
            name: agent.name,
            category: agent.category,
            tags: agent.tags
        }));
    }
    async deleteExpeditionData(expeditionId) {
        // Delete in order: results, messages, tasks, expedition
        const resultRepo = models_1.RepositoryFactory.getExpeditionResultRepository();
        const messageRepo = models_1.RepositoryFactory.getExpeditionMessageRepository();
        const taskRepo = models_1.RepositoryFactory.getExpeditionTaskRepository();
        const expeditionRepo = models_1.RepositoryFactory.getExpeditionRepository();
        await resultRepo.deleteByExpedition(expeditionId);
        await messageRepo.deleteByExpedition(expeditionId);
        await taskRepo.deleteByExpedition(expeditionId);
        await expeditionRepo.delete(expeditionId);
    }
    async getTopPerformingAgents(starshipId) {
        // Placeholder implementation - would analyze agent performance
        return [];
    }
    createError(code, message) {
        return {
            code,
            message,
            details: undefined
        };
    }
    handleError(error, fallbackCode) {
        if (error.code) {
            return error;
        }
        return {
            code: fallbackCode,
            message: error.message || 'Unknown error occurred',
            details: error
        };
    }
}
exports.ExpeditionService = ExpeditionService;
