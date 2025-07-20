import api from './api';
import { apiCache, CACHE_KEYS } from './cache';
import type {
  Expedition,
  ExpeditionTask,
  ExpeditionMessage,
  ExpeditionResult,
  CreateExpeditionRequest,
  UpdateExpeditionRequest,
  CreateTaskRequest,
  SendMessageRequest,
  CreateResultRequest,
  ExpeditionResponse,
  ExpeditionListResponse,
  ExpeditionStatsResponse,
  ExpeditionFilters,
  ExpeditionSort,
  PaginationOptions,
  ExpeditionEvent
} from '@starships/protocol';

// Cache key generators for expeditions
const EXPEDITION_CACHE_KEYS = {
  EXPEDITIONS_BY_STARSHIP: (starshipId: string) => `expeditions:starship:${starshipId}`,
  EXPEDITION_BY_ID: (id: string) => `expedition:${id}`,
  EXPEDITION_MESSAGES: (expeditionId: string) => `expedition:${expeditionId}:messages`,
  EXPEDITION_TASKS: (expeditionId: string) => `expedition:${expeditionId}:tasks`,
  EXPEDITION_RESULTS: (expeditionId: string) => `expedition:${expeditionId}:results`,
  EXPEDITION_STATS: (starshipId: string) => `expedition:stats:${starshipId}`,
};

// Helper function to invalidate expedition caches
const invalidateExpeditionCaches = (expeditionId?: string, starshipId?: string) => {
  if (expeditionId) {
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_BY_ID(expeditionId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_MESSAGES(expeditionId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_TASKS(expeditionId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_RESULTS(expeditionId));
  }
  if (starshipId) {
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITIONS_BY_STARSHIP(starshipId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_STATS(starshipId));
  }
  // Invalidate all expedition-related caches if no specific IDs provided
  if (!expeditionId && !starshipId) {
    apiCache.invalidatePattern('^expedition:');
  }
};

export const expeditionAPI = {
  // Get expeditions for a starship
  getExpeditionsByStarship: async (
    starshipId: string,
    filters?: ExpeditionFilters,
    sort?: ExpeditionSort,
    pagination?: PaginationOptions
  ): Promise<ExpeditionListResponse> => {
    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITIONS_BY_STARSHIP(starshipId);
    const cached = apiCache.get<ExpeditionListResponse>(cacheKey);
    if (cached && !filters && !sort && !pagination) {
      return cached;
    }

    const params = new URLSearchParams();
    if (filters) {
      if (filters.status) params.append('status', filters.status.join(','));
      if (filters.priority) params.append('priority', filters.priority.join(','));
      if (filters.tags) params.append('tags', filters.tags.join(','));
      if (filters.search) params.append('search', filters.search);
      if (filters.createdBy) params.append('createdBy', filters.createdBy);
      if (filters.assignedAgent) params.append('assignedAgent', filters.assignedAgent);
      if (filters.dateRange) {
        params.append('startDate', filters.dateRange.start);
        params.append('endDate', filters.dateRange.end);
      }
    }
    if (sort) {
      params.append('sortField', sort.field);
      params.append('sortDirection', sort.direction);
    }
    if (pagination) {
      params.append('page', pagination.page.toString());
      params.append('limit', pagination.limit.toString());
    }

    const data = await api
      .get(`/api/starships/${starshipId}/expeditions?${params.toString()}`)
      .then(res => res.data.data);
    
    if (!filters && !sort && !pagination) {
      apiCache.set(cacheKey, data, 2 * 60 * 1000); // Cache for 2 minutes
    }
    return data;
  },

  // Get expedition by ID (requires starshipId for proper routing)
  getExpedition: async (starshipId: string, expeditionId: string): Promise<ExpeditionResponse> => {
    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_BY_ID(expeditionId);
    const cached = apiCache.get<ExpeditionResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await api
      .get(`/api/starships/${starshipId}/expeditions/${expeditionId}`)
      .then(res => res.data.data);
    apiCache.set(cacheKey, data, 1 * 60 * 1000); // Cache for 1 minute
    return data;
  },

  // Create new expedition
  createExpedition: async (request: CreateExpeditionRequest): Promise<ExpeditionResponse> => {
    const data = await api
      .post(`/api/starships/${request.starshipId}/expeditions`, request)
      .then(res => res.data.data);
    invalidateExpeditionCaches(undefined, request.starshipId);
    return data;
  },

  // Update expedition
  updateExpedition: async (
    starshipId: string,
    expeditionId: string,
    updates: UpdateExpeditionRequest
  ): Promise<ExpeditionResponse> => {
    const data = await api
      .put(`/api/starships/${starshipId}/expeditions/${expeditionId}`, updates)
      .then(res => res.data.data);
    invalidateExpeditionCaches(expeditionId, starshipId);
    return data;
  },

  // Delete expedition
  deleteExpedition: async (starshipId: string, expeditionId: string): Promise<{ message: string }> => {
    const data = await api
      .delete(`/api/starships/${starshipId}/expeditions/${expeditionId}`)
      .then(res => res.data);
    invalidateExpeditionCaches(expeditionId, starshipId);
    return data;
  },

  // Start expedition
  startExpedition: async (starshipId: string, expeditionId: string): Promise<ExpeditionResponse> => {
    const data = await api
      .post(`/api/starships/${starshipId}/expeditions/${expeditionId}/start`)
      .then(res => res.data.data);
    invalidateExpeditionCaches(expeditionId, starshipId);
    return data;
  },

  // Pause expedition
  pauseExpedition: async (starshipId: string, expeditionId: string): Promise<ExpeditionResponse> => {
    const data = await api
      .post(`/api/starships/${starshipId}/expeditions/${expeditionId}/pause`)
      .then(res => res.data.data);
    invalidateExpeditionCaches(expeditionId, starshipId);
    return data;
  },

  // Resume expedition
  resumeExpedition: async (starshipId: string, expeditionId: string): Promise<ExpeditionResponse> => {
    const data = await api
      .post(`/api/starships/${starshipId}/expeditions/${expeditionId}/resume`)
      .then(res => res.data.data);
    invalidateExpeditionCaches(expeditionId, starshipId);
    return data;
  },

  // Cancel expedition
  cancelExpedition: async (starshipId: string, expeditionId: string): Promise<{ message: string }> => {
    const data = await api
      .post(`/api/starships/${starshipId}/expeditions/${expeditionId}/cancel`)
      .then(res => res.data);
    invalidateExpeditionCaches(expeditionId, starshipId);
    return data;
  },

  // Get expedition messages
  getMessages: async (starshipId: string, expeditionId: string): Promise<ExpeditionMessage[]> => {
    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_MESSAGES(expeditionId);
    const cached = apiCache.get<ExpeditionMessage[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await api
      .get(`/api/starships/${starshipId}/expeditions/${expeditionId}/messages`)
      .then(res => res.data.messages);
    apiCache.set(cacheKey, data, 30 * 1000); // Cache for 30 seconds
    return data;
  },

  // Send message
  sendMessage: async (starshipId: string, request: SendMessageRequest): Promise<{ response: string }> => {
    const data = await api
      .post(`/api/starships/${starshipId}/expeditions/${request.expeditionId}/messages`, request)
      .then(res => res.data.data);
    invalidateExpeditionCaches(request.expeditionId, starshipId);
    return data;
  },

  // Get expedition tasks
  getTasks: async (starshipId: string, expeditionId: string): Promise<ExpeditionTask[]> => {
    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_TASKS(expeditionId);
    const cached = apiCache.get<ExpeditionTask[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await api
      .get(`/api/starships/${starshipId}/expeditions/${expeditionId}/tasks`)
      .then(res => res.data.tasks);
    apiCache.set(cacheKey, data, 1 * 60 * 1000); // Cache for 1 minute
    return data;
  },

  // Create task
  createTask: async (starshipId: string, request: CreateTaskRequest): Promise<ExpeditionTask> => {
    const data = await api
      .post(`/api/starships/${starshipId}/expeditions/${request.expeditionId}/tasks`, request)
      .then(res => res.data.data.task);
    invalidateExpeditionCaches(request.expeditionId, starshipId);
    return data;
  },

  // Update task
  updateTask: async (
    starshipId: string,
    expeditionId: string,
    taskId: string,
    updates: Partial<ExpeditionTask>
  ): Promise<ExpeditionTask> => {
    const data = await api
      .put(`/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}`, updates)
      .then(res => res.data.data.task);
    invalidateExpeditionCaches(expeditionId, starshipId);
    return data;
  },

  // Get expedition results
  getResults: async (starshipId: string, expeditionId: string): Promise<ExpeditionResult[]> => {
    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_RESULTS(expeditionId);
    const cached = apiCache.get<ExpeditionResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await api
      .get(`/api/starships/${starshipId}/expeditions/${expeditionId}/results`)
      .then(res => res.data.results);
    apiCache.set(cacheKey, data, 2 * 60 * 1000); // Cache for 2 minutes
    return data;
  },

  // Validate result
  validateResult: async (
    starshipId: string,
    expeditionId: string,
    resultId: string
  ): Promise<{ validation: any }> => {
    const data = await api
      .post(`/api/starships/${starshipId}/expeditions/${expeditionId}/results/${resultId}/validate`)
      .then(res => res.data.data);
    invalidateExpeditionCaches(expeditionId, starshipId);
    return data;
  },

  // Get expedition statistics
  getStats: async (starshipId: string): Promise<ExpeditionStatsResponse> => {
    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_STATS(starshipId);
    const cached = apiCache.get<ExpeditionStatsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await api
      .get(`/api/starships/${starshipId}/expeditions/stats`)
      .then(res => res.data.data);
    apiCache.set(cacheKey, data, 5 * 60 * 1000); // Cache for 5 minutes
    return data;
  },
};

export default expeditionAPI;