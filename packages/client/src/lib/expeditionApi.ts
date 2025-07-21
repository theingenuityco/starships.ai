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
  ExpeditionEvent,
  ExpeditionError,
  ExpeditionErrorCode,
  QualityScore,
  MessageType
} from '@starships/protocol';
import type { AxiosError } from 'axios';

// ============================================================================
// ERROR HANDLING AND TYPES
// ============================================================================

/**
 * Enhanced error class for expedition API operations
 */
export class ExpeditionAPIError extends Error {
  public readonly code: ExpeditionErrorCode;
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly expeditionId?: string;
  public readonly taskId?: string;
  public readonly agentId?: string;

  constructor(
    message: string,
    code: ExpeditionErrorCode,
    statusCode: number = 500,
    details?: any,
    expeditionId?: string,
    taskId?: string,
    agentId?: string
  ) {
    super(message);
    this.name = 'ExpeditionAPIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.expeditionId = expeditionId;
    this.taskId = taskId;
    this.agentId = agentId;
  }

  static fromAxiosError(error: AxiosError, expeditionId?: string): ExpeditionAPIError {
    const response = error?.response;
    const data = response?.data as any;
    
    return new ExpeditionAPIError(
      data?.error || data?.message || error?.message || 'Unknown API error',
      data?.code || 'UNKNOWN_ERROR' as ExpeditionErrorCode,
      response?.status || 500,
      data?.details || data || error?.response?.data,
      expeditionId
    );
  }
}

/**
 * Loading state management for API operations
 */
export interface LoadingState {
  isLoading: boolean;
  error: ExpeditionAPIError | null;
  lastUpdated: string | null;
}

/**
 * API operation options
 */
export interface APIOptions {
  skipCache?: boolean;
  retries?: number;
  timeout?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryCondition: (error: AxiosError) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryCondition: (error: AxiosError) => {
    const status = error.response?.status;
    return !status || status >= 500 || status === 429; // Retry on server errors and rate limits
  }
};

/**
 * Retry utility with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  allowNullResult: boolean = false
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay, retryCondition } = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  let lastError: any = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Allow null/undefined results if explicitly permitted
      if (!allowNullResult && (result === null || result === undefined)) {
        throw new Error('Operation returned null or undefined');
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // If this is the last attempt, break and throw
      if (attempt === maxRetries) {
        break;
      }
      
      // Check if it's an AxiosError and if we should retry
      const isAxiosError = error && typeof error === 'object' && 'response' in error;
      
      // Don't retry on 4xx errors (client errors) except 429 (rate limit)
      if (isAxiosError) {
        const status = (error as AxiosError).response?.status;
        if (status && status >= 400 && status < 500 && status !== 429) {
          break; // Don't retry client errors
        }
      }
      
      if (!isAxiosError || !retryCondition(error as AxiosError)) {
        break;
      }
      
      // Wait before retrying
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Convert and throw the final error
  if (lastError instanceof ExpeditionAPIError) {
    throw lastError;
  }
  
  const isAxiosError = lastError && typeof lastError === 'object' && 'response' in lastError;
  if (isAxiosError) {
    throw ExpeditionAPIError.fromAxiosError(lastError as AxiosError);
  }
  
  const errorMessage = (lastError as any)?.message || 'Unknown error occurred';
  throw new ExpeditionAPIError(
    errorMessage,
    'VALIDATION_ERROR',
    500,
    lastError
  );
}

/**
 * Request validation utility
 */
function validateRequest(data: any, requiredFields: string[]): void {
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      throw new ExpeditionAPIError(
        `Missing required field: ${field}`,
        'VALIDATION_ERROR',
        400
      );
    }
  }
}

/**
 * Response validation utility
 */
function validateResponse<T>(response: any, expectedFields: string[]): T {
  if (!response || typeof response !== 'object') {
    throw new ExpeditionAPIError(
      'Invalid response format',
      'VALIDATION_ERROR',
      500
    );
  }
  
  for (const field of expectedFields) {
    if (response[field] === undefined) {
      console.warn(`[EXPEDITION-API] Missing expected field in response: ${field}`);
    }
  }
  
  return response as T;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

// Cache key generators for expeditions
const EXPEDITION_CACHE_KEYS = {
  EXPEDITIONS_BY_STARSHIP: (starshipId: string) => `expeditions:starship:${starshipId}`,
  EXPEDITION_BY_ID: (id: string) => `expedition:${id}`,
  EXPEDITION_MESSAGES: (expeditionId: string) => `expedition:${expeditionId}:messages`,
  EXPEDITION_TASKS: (expeditionId: string) => `expedition:${expeditionId}:tasks`,
  EXPEDITION_RESULTS: (expeditionId: string) => `expedition:${expeditionId}:results`,
  EXPEDITION_STATS: (starshipId: string) => `expedition:stats:${starshipId}`,
  EXPEDITION_STATUS: (expeditionId: string) => `expedition:${expeditionId}:status`,
  EXPEDITION_PROGRESS: (expeditionId: string) => `expedition:${expeditionId}:progress`,
  ACTIVE_EXPEDITIONS: (starshipId: string) => `expeditions:active:${starshipId}`,
  TASK_BY_ID: (taskId: string) => `task:${taskId}`,
  MESSAGE_BY_ID: (messageId: string) => `message:${messageId}`,
  MESSAGE_THREAD: (threadId: string) => `message:thread:${threadId}`,
  RESULT_BY_ID: (resultId: string) => `result:${resultId}`,
  RESULT_ANALYTICS: (expeditionId: string) => `expedition:${expeditionId}:analytics`,
  RECENT_MESSAGES: (expeditionId: string, limit: number, offset: number) => 
    `expedition:${expeditionId}:messages:recent:${limit}:${offset}`,
};

// Helper function to invalidate expedition caches
const invalidateExpeditionCaches = (expeditionId?: string, starshipId?: string) => {
  if (expeditionId) {
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_BY_ID(expeditionId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_MESSAGES(expeditionId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_TASKS(expeditionId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_RESULTS(expeditionId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_STATUS(expeditionId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_PROGRESS(expeditionId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.RESULT_ANALYTICS(expeditionId));
    apiCache.invalidatePattern(`^expedition:${expeditionId}:`);
  }
  if (starshipId) {
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITIONS_BY_STARSHIP(starshipId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_STATS(starshipId));
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.ACTIVE_EXPEDITIONS(starshipId));
  }
  // Invalidate all expedition-related caches if no specific IDs provided
  if (!expeditionId && !starshipId) {
    apiCache.invalidatePattern('^expedition:');
  }
};

// ============================================================================
// ENHANCED EXPEDITION API WRAPPER
// ============================================================================

export const expeditionAPI = {
  // ============================================================================
  // EXPEDITION MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * Get expeditions for a starship with enhanced error handling and caching
   */
  getExpeditionsByStarship: async (
    starshipId: string,
    filters?: ExpeditionFilters,
    sort?: ExpeditionSort,
    pagination?: PaginationOptions,
    options?: APIOptions
  ): Promise<ExpeditionListResponse> => {
    validateRequest({ starshipId }, ['starshipId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITIONS_BY_STARSHIP(starshipId);
    const cached = apiCache.get<ExpeditionListResponse>(cacheKey);
    if (cached && !filters && !sort && !pagination && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
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

      const response = await api.get(`/api/starships/${starshipId}/expeditions?${params.toString()}`);
      const data = validateResponse<ExpeditionListResponse>(response.data.data, ['expeditions', 'total']);
      
      if (!filters && !sort && !pagination) {
        apiCache.set(cacheKey, data, 2 * 60 * 1000); // Cache for 2 minutes
      }
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Get expedition by ID with enhanced error handling
   */
  getExpedition: async (
    starshipId: string, 
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_BY_ID(expeditionId);
    const cached = apiCache.get<ExpeditionResponse>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}`);
      const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition']);
      apiCache.set(cacheKey, data, 1 * 60 * 1000); // Cache for 1 minute
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Create new expedition with validation
   */
  createExpedition: async (
    request: CreateExpeditionRequest,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    validateRequest(request, ['starshipId', 'title', 'description', 'objective']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${request.starshipId}/expeditions`, request);
      const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition']);
      invalidateExpeditionCaches(undefined, request.starshipId);
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Update expedition with validation
   */
  updateExpedition: async (
    starshipId: string,
    expeditionId: string,
    updates: UpdateExpeditionRequest,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    return withRetry(async () => {
      const response = await api.put(`/api/starships/${starshipId}/expeditions/${expeditionId}`, updates);
      const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Delete expedition
   */
  deleteExpedition: async (
    starshipId: string, 
    expeditionId: string,
    options?: APIOptions
  ): Promise<{ message: string }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    return withRetry(async () => {
      const response = await api.delete(`/api/starships/${starshipId}/expeditions/${expeditionId}`);
      const data = validateResponse<{ message: string }>(response.data, ['message']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      return data;
    }, { maxRetries: options?.retries });
  },

  // ============================================================================
  // EXPEDITION CONTROL ENDPOINTS
  // ============================================================================

  /**
   * Start expedition execution
   */
  startExpedition: async (
    starshipId: string, 
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${expeditionId}/start`);
      const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Pause expedition execution
   */
  pauseExpedition: async (
    starshipId: string, 
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${expeditionId}/pause`);
      const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Resume expedition execution
   */
  resumeExpedition: async (
    starshipId: string, 
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${expeditionId}/resume`);
      const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Cancel expedition execution
   */
  cancelExpedition: async (
    starshipId: string, 
    expeditionId: string,
    options?: APIOptions
  ): Promise<{ message: string }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${expeditionId}/cancel`);
      const data = validateResponse<{ message: string }>(response.data, ['message']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      return data;
    }, { maxRetries: options?.retries });
  },

  // ============================================================================
  // TASK MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * Get all tasks for an expedition
   */
  getTasks: async (
    starshipId: string, 
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionTask[]> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_TASKS(expeditionId);
    const cached = apiCache.get<ExpeditionTask[]>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/tasks`);
      const data = response.data.data.tasks || [];
      apiCache.set(cacheKey, data, 1 * 60 * 1000); // Cache for 1 minute
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Get specific task details
   */
  getTask: async (
    starshipId: string,
    expeditionId: string,
    taskId: string,
    options?: APIOptions
  ): Promise<ExpeditionTask> => {
    validateRequest({ starshipId, expeditionId, taskId }, ['starshipId', 'expeditionId', 'taskId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId);
    const cached = apiCache.get<ExpeditionTask>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}`);
      const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task']);
      apiCache.set(cacheKey, data.task, 1 * 60 * 1000);
      return data.task;
    }, { maxRetries: options?.retries });
  },

  /**
   * Create a new task for an expedition
   */
  createTask: async (
    starshipId: string, 
    request: CreateTaskRequest,
    options?: APIOptions
  ): Promise<ExpeditionTask> => {
    validateRequest(request, ['expeditionId', 'title', 'description', 'deliverable']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${request.expeditionId}/tasks`, request);
      const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task']);
      invalidateExpeditionCaches(request.expeditionId, starshipId);
      return data.task;
    }, { maxRetries: options?.retries });
  },

  /**
   * Update a task
   */
  updateTask: async (
    starshipId: string,
    expeditionId: string,
    taskId: string,
    updates: Partial<ExpeditionTask>,
    options?: APIOptions
  ): Promise<ExpeditionTask> => {
    validateRequest({ starshipId, expeditionId, taskId }, ['starshipId', 'expeditionId', 'taskId']);

    return withRetry(async () => {
      const response = await api.put(`/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}`, updates);
      const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      apiCache.invalidate(EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId));
      return data.task;
    }, { maxRetries: options?.retries });
  },

  /**
   * Delete a task
   */
  deleteTask: async (
    starshipId: string,
    expeditionId: string,
    taskId: string,
    options?: APIOptions
  ): Promise<{ message: string }> => {
    validateRequest({ starshipId, expeditionId, taskId }, ['starshipId', 'expeditionId', 'taskId']);

    return withRetry(async () => {
      const response = await api.delete(`/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}`);
      const data = validateResponse<{ message: string }>(response.data, ['message']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      apiCache.invalidate(EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId));
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Assign task to an agent
   */
  assignTask: async (
    starshipId: string,
    expeditionId: string,
    taskId: string,
    agentId: string,
    options?: APIOptions
  ): Promise<ExpeditionTask> => {
    validateRequest({ starshipId, expeditionId, taskId, agentId }, ['starshipId', 'expeditionId', 'taskId', 'agentId']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}/assign`, { agentId });
      const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      apiCache.invalidate(EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId));
      return data.task;
    }, { maxRetries: options?.retries });
  },

  /**
   * Mark task as completed
   */
  completeTask: async (
    starshipId: string,
    expeditionId: string,
    taskId: string,
    result?: string,
    options?: APIOptions
  ): Promise<ExpeditionTask> => {
    validateRequest({ starshipId, expeditionId, taskId }, ['starshipId', 'expeditionId', 'taskId']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}/complete`, { result });
      const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      apiCache.invalidate(EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId));
      return data.task;
    }, { maxRetries: options?.retries });
  },

  // ============================================================================
  // MESSAGING ENDPOINTS
  // ============================================================================

  /**
   * Get all messages for an expedition
   */
  getMessages: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionMessage[]> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_MESSAGES(expeditionId);
    const cached = apiCache.get<ExpeditionMessage[]>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    try {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/messages`);
      
      // Handle different response structures gracefully - never throw errors
      let messages: ExpeditionMessage[] = [];
      
      try {
        if (response?.data?.success && response.data.data?.messages) {
          messages = response.data.data.messages;
        } else if (response?.data?.data?.messages) {
          messages = response.data.data.messages;
        } else if (Array.isArray(response?.data?.data)) {
          messages = response.data.data;
        } else if (Array.isArray(response?.data)) {
          messages = response.data;
        } else {
          console.warn('[EXPEDITION-API] Unexpected response structure for getMessages:', response?.data);
          messages = [];
        }
        
        // Ensure we have an array
        if (!Array.isArray(messages)) {
          console.warn('[EXPEDITION-API] Messages is not an array, defaulting to empty array');
          messages = [];
        }
      } catch (parseError) {
        console.warn('[EXPEDITION-API] Error parsing messages response, returning empty array:', parseError);
        messages = [];
      }
      
      apiCache.set(cacheKey, messages, 30 * 1000); // Cache for 30 seconds
      return messages;
    } catch (error) {
      console.warn('[EXPEDITION-API] Failed to fetch messages, returning empty array:', error);
      // Return empty array instead of throwing error
      return [];
    }
  },

  /**
   * Get specific message details
   */
  getMessage: async (
    starshipId: string,
    expeditionId: string,
    messageId: string,
    options?: APIOptions
  ): Promise<ExpeditionMessage> => {
    validateRequest({ starshipId, expeditionId, messageId }, ['starshipId', 'expeditionId', 'messageId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.MESSAGE_BY_ID(messageId);
    const cached = apiCache.get<ExpeditionMessage>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/messages/${messageId}`);
      const data = validateResponse<{ message: ExpeditionMessage }>(response.data.data, ['message']);
      apiCache.set(cacheKey, data.message, 5 * 60 * 1000);
      return data.message;
    }, { maxRetries: options?.retries });
  },

  /**
   * Get recent messages with pagination
   */
  getRecentMessages: async (
    starshipId: string,
    expeditionId: string,
    limit: number = 50,
    offset: number = 0,
    options?: APIOptions
  ): Promise<{ messages: ExpeditionMessage[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.RECENT_MESSAGES(expeditionId, limit, offset);
    const cached = apiCache.get<{ messages: ExpeditionMessage[]; pagination: any }>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/messages/recent?limit=${limit}&offset=${offset}`);
      const data = validateResponse<{ messages: ExpeditionMessage[]; pagination: any }>(response.data.data, ['messages', 'pagination']);
      apiCache.set(cacheKey, data, 30 * 1000);
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Get message thread
   */
  getMessageThread: async (
    starshipId: string,
    expeditionId: string,
    messageId: string,
    options?: APIOptions
  ): Promise<ExpeditionMessage[]> => {
    validateRequest({ starshipId, expeditionId, messageId }, ['starshipId', 'expeditionId', 'messageId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.MESSAGE_THREAD(messageId);
    const cached = apiCache.get<ExpeditionMessage[]>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/messages/${messageId}/thread`);
      const data = response.data.data.thread || [];
      apiCache.set(cacheKey, data, 2 * 60 * 1000);
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Send message to an expedition
   */
  sendMessage: async (
    starshipId: string, 
    request: SendMessageRequest,
    options?: APIOptions
  ): Promise<{ response: string }> => {
    validateRequest(request, ['expeditionId', 'content', 'messageType']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${request.expeditionId}/messages`, request);
      const data = validateResponse<{ response: string }>(response.data.data, ['response']);
      invalidateExpeditionCaches(request.expeditionId, starshipId);
      return data;
    }, { maxRetries: options?.retries });
  },

  // ============================================================================
  // RESULTS ENDPOINTS
  // ============================================================================

  /**
   * Get all results for an expedition
   */
  getResults: async (
    starshipId: string, 
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionResult[]> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_RESULTS(expeditionId);
    const cached = apiCache.get<ExpeditionResult[]>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/results`);
      const data = response.data.data.results || [];
      apiCache.set(cacheKey, data, 2 * 60 * 1000); // Cache for 2 minutes
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Get specific result details
   */
  getResult: async (
    starshipId: string,
    expeditionId: string,
    resultId: string,
    options?: APIOptions
  ): Promise<ExpeditionResult> => {
    validateRequest({ starshipId, expeditionId, resultId }, ['starshipId', 'expeditionId', 'resultId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.RESULT_BY_ID(resultId);
    const cached = apiCache.get<ExpeditionResult>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/results/${resultId}`);
      const data = validateResponse<{ result: ExpeditionResult }>(response.data.data, ['result']);
      apiCache.set(cacheKey, data.result, 5 * 60 * 1000);
      return data.result;
    }, { maxRetries: options?.retries });
  },

  /**
   * Create a new expedition result
   */
  createResult: async (
    starshipId: string,
    request: CreateResultRequest,
    options?: APIOptions
  ): Promise<ExpeditionResult> => {
    validateRequest(request, ['expeditionId', 'title', 'content', 'resultType', 'format']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${request.expeditionId}/results`, request);
      const data = validateResponse<{ result: ExpeditionResult }>(response.data.data, ['result']);
      invalidateExpeditionCaches(request.expeditionId, starshipId);
      return data.result;
    }, { maxRetries: options?.retries });
  },

  /**
   * Add or update quality assessment for a result
   */
  updateResultQuality: async (
    starshipId: string,
    expeditionId: string,
    resultId: string,
    qualityScore: Partial<QualityScore>,
    options?: APIOptions
  ): Promise<ExpeditionResult> => {
    validateRequest({ starshipId, expeditionId, resultId }, ['starshipId', 'expeditionId', 'resultId']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${expeditionId}/results/${resultId}/quality-score`, qualityScore);
      const data = validateResponse<{ result: ExpeditionResult }>(response.data.data, ['result']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      apiCache.invalidate(EXPEDITION_CACHE_KEYS.RESULT_BY_ID(resultId));
      return data.result;
    }, { maxRetries: options?.retries });
  },

  /**
   * Get results analytics for an expedition
   */
  getResultsAnalytics: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<{
    totalResults: number;
    resultsByType: Record<string, number>;
    resultsByFormat: Record<string, number>;
    averageQuality: {
      overall: number;
      completeness: number;
      accuracy: number;
      relevance: number;
      clarity: number;
    };
    qualityDistribution: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    };
  }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.RESULT_ANALYTICS(expeditionId);
    const cached = apiCache.get<any>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/results/analytics`);
      const data = validateResponse<{ analytics: any }>(response.data.data, ['analytics']);
      apiCache.set(cacheKey, data.analytics, 5 * 60 * 1000);
      return data.analytics;
    }, { maxRetries: options?.retries });
  },

  /**
   * Validate expedition result
   */
  validateResult: async (
    starshipId: string,
    expeditionId: string,
    resultId: string,
    options?: APIOptions
  ): Promise<{ validation: any }> => {
    validateRequest({ starshipId, expeditionId, resultId }, ['starshipId', 'expeditionId', 'resultId']);

    return withRetry(async () => {
      const response = await api.post(`/api/starships/${starshipId}/expeditions/${expeditionId}/results/${resultId}/validate`);
      const data = validateResponse<{ validation: any }>(response.data.data, ['validation']);
      invalidateExpeditionCaches(expeditionId, starshipId);
      return data;
    }, { maxRetries: options?.retries });
  },

  // ============================================================================
  // REAL-TIME STATUS ENDPOINTS
  // ============================================================================

  /**
   * Get real-time expedition status and progress
   */
  getExpeditionStatus: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<{
    expedition: Expedition;
    isActive: boolean;
    progress: any;
    taskStats: any;
    recentMessages: ExpeditionMessage[];
    lastUpdated: string;
  }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_STATUS(expeditionId);
    const cached = apiCache.get<any>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/status`);
      const data = validateResponse<{ status: any }>(response.data.data, ['status']);
      apiCache.set(cacheKey, data.status, 30 * 1000); // Cache for 30 seconds
      return data.status;
    }, { maxRetries: options?.retries }, true); // Allow null result
  },

  /**
   * Get detailed expedition progress information
   */
  getExpeditionProgress: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<any> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_PROGRESS(expeditionId);
    const cached = apiCache.get<any>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}/progress`);
      const data = response.data.data.progress;
      if (data) {
        apiCache.set(cacheKey, data, 30 * 1000); // Cache for 30 seconds
      }
      return data;
    }, { maxRetries: options?.retries }, true); // Allow null result
  },

  /**
   * Get all active expeditions for a starship
   */
  getActiveExpeditions: async (
    starshipId: string,
    options?: APIOptions
  ): Promise<{
    expeditions: (Expedition & { isActivelyProcessing: boolean })[];
    total: number;
    activeCount: number;
  }> => {
    validateRequest({ starshipId }, ['starshipId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.ACTIVE_EXPEDITIONS(starshipId);
    const cached = apiCache.get<any>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/active`);
      const data = validateResponse<any>(response.data.data, ['expeditions']);
      apiCache.set(cacheKey, data, 1 * 60 * 1000); // Cache for 1 minute
      return data;
    }, { maxRetries: options?.retries });
  },

  /**
   * Get expedition statistics
   */
  getStats: async (
    starshipId: string,
    options?: APIOptions
  ): Promise<ExpeditionStatsResponse> => {
    validateRequest({ starshipId }, ['starshipId']);

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_STATS(starshipId);
    const cached = apiCache.get<ExpeditionStatsResponse>(cacheKey);
    if (cached && !options?.skipCache) {
      return cached;
    }

    return withRetry(async () => {
      const response = await api.get(`/api/starships/${starshipId}/expeditions/stats`);
      const data = validateResponse<ExpeditionStatsResponse>(response.data.data, ['totalExpeditions']);
      apiCache.set(cacheKey, data, 5 * 60 * 1000); // Cache for 5 minutes
      return data;
    }, { maxRetries: options?.retries });
  },

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clear all expedition caches
   */
  clearCache: (expeditionId?: string, starshipId?: string) => {
    invalidateExpeditionCaches(expeditionId, starshipId);
  },

  /**
   * Get loading state helper
   */
  createLoadingState: (): LoadingState => ({
    isLoading: false,
    error: null,
    lastUpdated: null
  }),

  /**
   * Check if an error is retryable
   */
  isRetryableError: (error: ExpeditionAPIError): boolean => {
    return DEFAULT_RETRY_CONFIG.retryCondition({ response: { status: error.statusCode } } as AxiosError);
  }
};

export default expeditionAPI;