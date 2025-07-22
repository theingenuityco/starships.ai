import api from './api'
import { apiCache, CACHE_KEYS } from './cache'
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
  MessageType,
} from '@starships/protocol'
import type { AxiosError } from 'axios'

// ============================================================================
// ERROR HANDLING AND TYPES
// ============================================================================

/**
 * Enhanced error class for expedition API operations
 */
export class ExpeditionAPIError extends Error {
  public readonly code: ExpeditionErrorCode
  public readonly statusCode: number
  public readonly details?: any
  public readonly expeditionId?: string
  public readonly taskId?: string
  public readonly agentId?: string

  constructor(
    message: string,
    code: ExpeditionErrorCode,
    statusCode: number = 500,
    details?: any,
    expeditionId?: string,
    taskId?: string,
    agentId?: string
  ) {
    super(message)
    this.name = 'ExpeditionAPIError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.expeditionId = expeditionId
    this.taskId = taskId
    this.agentId = agentId
  }

  static fromAxiosError(error: AxiosError, expeditionId?: string): ExpeditionAPIError {
    const response = error?.response
    const data = response?.data as any

    return new ExpeditionAPIError(
      data?.error || data?.message || error?.message || 'Unknown API error',
      data?.code || ('UNKNOWN_ERROR' as ExpeditionErrorCode),
      response?.status || 500,
      data?.details || data || error?.response?.data,
      expeditionId
    )
  }
}

/**
 * Loading state management for API operations
 */
export interface LoadingState {
  isLoading: boolean
  error: ExpeditionAPIError | null
  lastUpdated: string | null
}

/**
 * API operation options
 */
export interface APIOptions {
  skipCache?: boolean
  retries?: number
  timeout?: number
  onProgress?: (progress: number) => void
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  retryCondition: (error: AxiosError) => boolean
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryCondition: (error: AxiosError) => {
    const status = error.response?.status
    return !status || status >= 500 || status === 429 // Retry on server errors and rate limits
  },
}

/**
 * Retry utility with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  allowNullResult: boolean = false
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay, retryCondition } = { ...DEFAULT_RETRY_CONFIG, ...config }
  const operationId = Math.random().toString(36).substring(7);

  console.log(`[EXPEDITION-API] [${operationId}] ===== WITHRETRY START =====`);
  console.log(`[EXPEDITION-API] [${operationId}] Starting withRetry operation:`, {
    maxRetries,
    baseDelay,
    maxDelay,
    allowNullResult,
    operationId,
    timestamp: new Date().toISOString()
  });

  let lastError: any = null
  let operationSucceeded = false
  const attemptResults: any[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptId = `${operationId}-${attempt + 1}`;
    console.log(`[EXPEDITION-API] [${attemptId}] ===== ATTEMPT ${attempt + 1}/${maxRetries + 1} START =====`);
    
    try {
      console.log(`[EXPEDITION-API] [${attemptId}] About to call operation function...`);
      console.log(`[EXPEDITION-API] [${attemptId}] Operation type:`, typeof operation);
      console.log(`[EXPEDITION-API] [${attemptId}] Operation name:`, operation.name || 'anonymous');
      
      // Enhanced timeout wrapper with proper error handling
      console.log(`[EXPEDITION-API] [${attemptId}] Creating operation promise...`);
      
      let timeoutId: NodeJS.Timeout | undefined;
      let operationCompleted = false;
      
      // Wrap the operation with enhanced error handling
      const operationPromise = new Promise<T>(async (resolve, reject) => {
        try {
          console.log(`[EXPEDITION-API] [${attemptId}] Executing operation...`);
          const result = await operation();
          
          if (!operationCompleted) {
            operationCompleted = true;
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            console.log(`[EXPEDITION-API] [${attemptId}] Operation completed successfully`);
            resolve(result);
          }
        } catch (error) {
          if (!operationCompleted) {
            operationCompleted = true;
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            console.error(`[EXPEDITION-API] [${attemptId}] Operation failed:`, {
              error,
              errorType: typeof error,
              errorMessage: (error as any)?.message,
              errorCode: (error as any)?.code,
              errorStatus: (error as any)?.response?.status
            });
            reject(error);
          }
        }
      });
      
      // Create timeout promise with proper error details
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          if (!operationCompleted) {
            operationCompleted = true;
            console.error(`[EXPEDITION-API] [${attemptId}] TIMEOUT: Operation exceeded 30 seconds`);
            console.error(`[EXPEDITION-API] [${attemptId}] TIMEOUT DETAILS:`, {
              operationName: operation.name || 'anonymous',
              operationType: typeof operation,
              attemptNumber: attempt + 1,
              maxRetries,
              timestamp: new Date().toISOString()
            });
            
            reject(new ExpeditionAPIError(
              'Request timeout - the operation took longer than 30 seconds to complete. This may indicate server issues or network problems.',
              'WORKFLOW_FAILED' as ExpeditionErrorCode,
              408,
              {
                timeoutDuration: 30000,
                attemptNumber: attempt + 1,
                operationId: attemptId,
                timestamp: new Date().toISOString(),
                possibleCauses: [
                  'Server is not responding',
                  'Network connectivity issues',
                  'API endpoint is down or overloaded',
                  'Authentication token issues',
                  'Request is hanging without proper error handling'
                ]
              }
            ));
          }
        }, 30000);
      });
      
      console.log(`[EXPEDITION-API] [${attemptId}] Starting Promise.race between operation and timeout...`);
      const result = await Promise.race([operationPromise, timeoutPromise]);
      
      console.log(`[EXPEDITION-API] [${attemptId}] ===== OPERATION SUCCESS =====`);
      console.log(`[EXPEDITION-API] [${attemptId}] Operation completed successfully:`, {
        resultType: typeof result,
        resultConstructor: result?.constructor?.name,
        hasResult: result !== null && result !== undefined,
        resultKeys: result && typeof result === 'object' ? Object.keys(result) : 'N/A',
        resultStringified: JSON.stringify(result, null, 2).substring(0, 500) + '...',
        timestamp: new Date().toISOString()
      });

      // Allow null/undefined results if explicitly permitted
      if (!allowNullResult && (result === null || result === undefined)) {
        console.warn(`[EXPEDITION-API] [${attemptId}] Operation returned null/undefined but allowNullResult is false`);
        throw new Error('Operation returned null or undefined')
      }

      operationSucceeded = true
      console.log(`[EXPEDITION-API] [${attemptId}] withRetry operation succeeded, returning result`);
      console.log(`[EXPEDITION-API] [${operationId}] ===== WITHRETRY SUCCESS =====`);
      return result
    } catch (error) {
      lastError = error
      operationSucceeded = false
      
      console.error(`[EXPEDITION-API] [${attemptId}] ===== ATTEMPT FAILED =====`);
      
      // Comprehensive error analysis
      const errorAnalysis = {
        error: error,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        errorMessage: (error as any)?.message,
        errorStack: (error as any)?.stack?.substring(0, 1000) + '...',
        isAxiosError: error && typeof error === 'object' && 'response' in error,
        isNetworkError: error && typeof error === 'object' && 'code' in error,
        status: (error as any)?.response?.status,
        statusText: (error as any)?.response?.statusText,
        responseData: (error as any)?.response?.data,
        responseHeaders: (error as any)?.response?.headers,
        requestConfig: (error as any)?.config ? {
          url: (error as any)?.config?.url,
          method: (error as any)?.config?.method,
          timeout: (error as any)?.config?.timeout,
          headers: (error as any)?.config?.headers
        } : undefined,
        code: (error as any)?.code,
        name: (error as any)?.name,
        errno: (error as any)?.errno,
        syscall: (error as any)?.syscall,
        hostname: (error as any)?.hostname,
        port: (error as any)?.port,
        timestamp: new Date().toISOString()
      };
      
      console.error(`[EXPEDITION-API] [${attemptId}] Detailed error analysis:`, errorAnalysis);
      attemptResults.push({ attempt: attempt + 1, error: errorAnalysis });

      // If this is the last attempt, break and throw
      if (attempt === maxRetries) {
        console.warn(`[EXPEDITION-API] [${attemptId}] Last attempt failed, will throw error`);
        console.error(`[EXPEDITION-API] [${operationId}] All attempts exhausted. Attempt history:`, attemptResults);
        break
      }

      // Check for request cancellation or network errors
      if (error && typeof error === 'object') {
        const errorCode = (error as any)?.code;
        const errorName = (error as any)?.name;
        
        console.log(`[EXPEDITION-API] [${attemptId}] Checking for non-retryable errors:`, { errorCode, errorName });
        
        // Don't retry on request cancellation or certain network errors
        if (errorCode === 'ECONNABORTED' || errorName === 'CanceledError' || errorCode === 'ERR_CANCELED') {
          console.warn(`[EXPEDITION-API] [${attemptId}] Request was cancelled, not retrying`);
          break;
        }
        
        // Check for connection refused
        if (errorCode === 'ECONNREFUSED') {
          console.error(`[EXPEDITION-API] [${attemptId}] Connection refused - server may be down`);
          // Still retry in case server comes back up
        }
      }

      // Check if it's an AxiosError and if we should retry
      const isAxiosError = error && typeof error === 'object' && 'response' in error
      console.log(`[EXPEDITION-API] [${attemptId}] Is Axios error:`, isAxiosError);

      // Don't retry on 4xx errors (client errors) except 429 (rate limit)
      if (isAxiosError) {
        const status = (error as AxiosError).response?.status
        console.log(`[EXPEDITION-API] [${attemptId}] HTTP status:`, status);
        
        if (status && status >= 400 && status < 500 && status !== 429) {
          console.warn(`[EXPEDITION-API] [${attemptId}] Not retrying client error ${status}`);
          break // Don't retry client errors
        }
      }

      // Check retry condition
      const shouldRetry = !isAxiosError || retryCondition(error as AxiosError);
      console.log(`[EXPEDITION-API] [${attemptId}] Should retry:`, shouldRetry);
      
      if (!shouldRetry) {
        console.warn(`[EXPEDITION-API] [${attemptId}] Error does not meet retry conditions`);
        break
      }

      // Wait before retrying
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      console.log(`[EXPEDITION-API] [${attemptId}] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay))
      console.log(`[EXPEDITION-API] [${attemptId}] Retry delay completed, starting next attempt`);
    }
  }

  // Log final state before throwing with defensive logging
  console.error(`[EXPEDITION-API] [${operationId}] ===== WITHRETRY FAILED =====`);
  console.error(`[EXPEDITION-API] [${operationId}] withRetry operation failed after all attempts`);
  console.error(`[EXPEDITION-API] [${operationId}] Final state:`, {
    operationSucceeded,
    lastErrorExists: !!lastError,
    lastErrorType: typeof lastError,
    lastErrorConstructor: lastError?.constructor?.name,
    lastErrorMessage: (lastError as any)?.message,
    totalAttempts: attemptResults.length,
    timestamp: new Date().toISOString()
  });
  console.error(`[EXPEDITION-API] [${operationId}] Complete attempt history:`, attemptResults);
  console.error(`[EXPEDITION-API] [${operationId}] Last error object:`, lastError);

  // Convert and throw the final error
  if (lastError instanceof ExpeditionAPIError) {
    console.warn(`[EXPEDITION-API] [${operationId}] Throwing ExpeditionAPIError`);
    throw lastError
  }

  const isAxiosError = lastError && typeof lastError === 'object' && 'response' in lastError
  if (isAxiosError) {
    console.warn(`[EXPEDITION-API] [${operationId}] Converting AxiosError to ExpeditionAPIError`);
    throw ExpeditionAPIError.fromAxiosError(lastError as AxiosError)
  }

  // Handle empty or null error objects - provide more informative logging
  if (!lastError) {
    console.error(`[EXPEDITION-API] [${operationId}] CRITICAL: No error object available - this indicates the operation failed but no error was caught`);
    console.error(`[EXPEDITION-API] [${operationId}] This usually means:`);
    console.error(`[EXPEDITION-API] [${operationId}] 1. The request was cancelled before completion`);
    console.error(`[EXPEDITION-API] [${operationId}] 2. A network interruption occurred`);
    console.error(`[EXPEDITION-API] [${operationId}] 3. The operation timed out without throwing an error`);
    console.error(`[EXPEDITION-API] [${operationId}] 4. There is a bug in the error handling logic`);
    console.error(`[EXPEDITION-API] [${operationId}] 5. Axios timeout (10s) conflicted with custom timeout (30s)`);
    console.error(`[EXPEDITION-API] [${operationId}] 6. Authentication token expired during request`);
    
    throw new ExpeditionAPIError(
      'Request failed - the operation completed all retry attempts but no error information was captured. This typically indicates a timeout or network connectivity issue.',
      'WORKFLOW_FAILED',
      408, // Use 408 Request Timeout instead of 500
      {
        note: 'No error object available after all retry attempts',
        operationSucceeded,
        operationId,
        attemptHistory: attemptResults,
        debugInfo: 'withRetry completed all attempts but no error was captured',
        possibleCauses: [
          'Network timeout occurred',
          'Server took too long to respond',
          'Request was cancelled or interrupted',
          'Authentication token expired during request',
          'API endpoint is temporarily unavailable',
          'Axios timeout (10s) conflicted with Promise.race timeout (30s)'
        ],
        troubleshooting: [
          'Check network connectivity',
          'Verify API server is running on http://localhost:4000',
          'Check authentication status',
          'Try again in a few moments',
          'Check browser console for additional error details'
        ]
      }
    );
  }

  if (typeof lastError === 'object' && Object.keys(lastError).length === 0) {
    console.warn(`[EXPEDITION-API] [${operationId}] Empty error object detected - this may indicate a network timeout`);
    throw new ExpeditionAPIError(
      'Request failed - please try again',
      'WORKFLOW_FAILED',
      500,
      {
        originalError: lastError,
        errorType: typeof lastError,
        operationId,
        attemptHistory: attemptResults,
        note: 'Empty error object detected'
      }
    );
  }

  // Handle standard Error objects
  if (lastError instanceof Error) {
    console.warn(`[EXPEDITION-API] [${operationId}] Converting Error to ExpeditionAPIError`);
    throw new ExpeditionAPIError(
      lastError.message || 'Unknown error occurred',
      'WORKFLOW_FAILED',
      500,
      {
        originalError: lastError,
        errorType: typeof lastError,
        errorConstructor: lastError.constructor.name,
        stack: lastError.stack,
        operationId,
        attemptHistory: attemptResults
      }
    );
  }

  // Handle any other error types
  console.warn(`[EXPEDITION-API] [${operationId}] Converting unknown error type to ExpeditionAPIError`);
  const errorMessage = (lastError as any)?.message || String(lastError) || 'Unknown error occurred'
  const errorCode = (lastError as any)?.code || 'WORKFLOW_FAILED'

  throw new ExpeditionAPIError(
    errorMessage,
    errorCode as ExpeditionErrorCode,
    500,
    {
      originalError: lastError,
      errorType: typeof lastError,
      errorConstructor: lastError?.constructor?.name,
      operationId,
      attemptHistory: attemptResults
    }
  )
}

/**
 * Request validation utility
 */
function validateRequest(data: any, requiredFields: string[]): void {
  console.log('[EXPEDITION-API] Validating request:', { data, requiredFields })
  
  for (const field of requiredFields) {
    const value = data[field]
    console.log(`[EXPEDITION-API] Checking field '${field}':`, value)
    
    if (value === undefined || value === null || value === '') {
      const error = new ExpeditionAPIError(`Missing required field: ${field}`, 'VALIDATION_ERROR', 400)
      console.error('[EXPEDITION-API] Validation failed:', error)
      throw error
    }
    
    // Special validation for arrays (like selectedAgents)
    if (field === 'selectedAgents' && Array.isArray(value) && value.length === 0) {
      const error = new ExpeditionAPIError(`Field '${field}' cannot be empty`, 'VALIDATION_ERROR', 400)
      console.error('[EXPEDITION-API] Array validation failed:', error)
      throw error
    }
  }
  
  console.log('[EXPEDITION-API] Request validation passed')
}

/**
 * Response validation utility
 */
function validateResponse<T>(response: any, expectedFields: string[]): T {
  if (!response || typeof response !== 'object') {
    throw new ExpeditionAPIError('Invalid response format', 'VALIDATION_ERROR', 500)
  }

  for (const field of expectedFields) {
    if (response[field] === undefined) {
      console.warn(`[EXPEDITION-API] Missing expected field in response: ${field}`)
    }
  }

  return response as T
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
}

// Helper function to invalidate expedition caches
const invalidateExpeditionCaches = (expeditionId?: string, starshipId?: string) => {
  if (expeditionId) {
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_BY_ID(expeditionId))
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_MESSAGES(expeditionId))
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_TASKS(expeditionId))
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_RESULTS(expeditionId))
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_STATUS(expeditionId))
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_PROGRESS(expeditionId))
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.RESULT_ANALYTICS(expeditionId))
    apiCache.invalidatePattern(`^expedition:${expeditionId}:`)
  }
  if (starshipId) {
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITIONS_BY_STARSHIP(starshipId))
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.EXPEDITION_STATS(starshipId))
    apiCache.invalidate(EXPEDITION_CACHE_KEYS.ACTIVE_EXPEDITIONS(starshipId))
  }
  // Invalidate all expedition-related caches if no specific IDs provided
  if (!expeditionId && !starshipId) {
    apiCache.invalidatePattern('^expedition:')
  }
}

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
    validateRequest({ starshipId }, ['starshipId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITIONS_BY_STARSHIP(starshipId)
    const cached = apiCache.get<ExpeditionListResponse>(cacheKey)
    if (cached && !filters && !sort && !pagination && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const params = new URLSearchParams()
        if (filters) {
          if (filters.status) params.append('status', filters.status.join(','))
          if (filters.priority) params.append('priority', filters.priority.join(','))
          if (filters.tags) params.append('tags', filters.tags.join(','))
          if (filters.search) params.append('search', filters.search)
          if (filters.createdBy) params.append('createdBy', filters.createdBy)
          if (filters.assignedAgent) params.append('assignedAgent', filters.assignedAgent)
          if (filters.dateRange) {
            params.append('startDate', filters.dateRange.start)
            params.append('endDate', filters.dateRange.end)
          }
        }
        if (sort) {
          params.append('sortField', sort.field)
          params.append('sortDirection', sort.direction)
        }
        if (pagination) {
          params.append('page', pagination.page.toString())
          params.append('limit', pagination.limit.toString())
        }

        const response = await api.get(
          `/api/starships/${starshipId}/expeditions?${params.toString()}`
        )
        const data = validateResponse<ExpeditionListResponse>(response.data.data, [
          'expeditions',
          'total',
        ])

        if (!filters && !sort && !pagination) {
          apiCache.set(cacheKey, data, 2 * 60 * 1000) // Cache for 2 minutes
        }
        return data
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Get expedition by ID with enhanced error handling
   */
  getExpedition: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_BY_ID(expeditionId)
    const cached = apiCache.get<ExpeditionResponse>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(`/api/starships/${starshipId}/expeditions/${expeditionId}`)
        const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition'])
        apiCache.set(cacheKey, data, 1 * 60 * 1000) // Cache for 1 minute
        return data
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Create new expedition with validation
   */
  createExpedition: async (
    request: CreateExpeditionRequest,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    // Enhanced validation to include selectedAgents
    validateRequest(request, ['starshipId', 'title', 'description', 'objective', 'selectedAgents'])

    // Additional validation for selectedAgents array
    if (!Array.isArray(request.selectedAgents) || request.selectedAgents.length === 0) {
      throw new ExpeditionAPIError(
        'At least one agent must be selected for the expedition',
        'VALIDATION_ERROR',
        400,
        { field: 'selectedAgents', value: request.selectedAgents }
      )
    }

    return withRetry(
      async () => {
        console.log('[EXPEDITION-API] ===== CREATE EXPEDITION OPERATION START =====');
        console.log('[EXPEDITION-API] Making POST request to create expedition:', {
          url: `/api/starships/${request.starshipId}/expeditions`,
          request: request,
          timestamp: new Date().toISOString()
        });
        
        try {
          console.log('[EXPEDITION-API] About to call api.post...');
          console.log('[EXPEDITION-API] API instance details:', {
            baseURL: api.defaults.baseURL,
            timeout: api.defaults.timeout,
            hasInterceptors: {
              request: !!api.interceptors.request,
              response: !!api.interceptors.response
            }
          });
          
          const response = await api.post(`/api/starships/${request.starshipId}/expeditions`, request)
          console.log('[EXPEDITION-API] api.post completed successfully');
          
          console.log('[EXPEDITION-API] Received response from create expedition:', {
            status: response.status,
            statusText: response.statusText,
            hasData: !!response.data,
            dataKeys: response.data ? Object.keys(response.data) : [],
            responseData: response.data,
            timestamp: new Date().toISOString()
          });
          
          console.log('[EXPEDITION-API] About to validate response...');
          const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition'])
          console.log('[EXPEDITION-API] Response validation completed:', data);
          
          console.log('[EXPEDITION-API] Invalidating caches...');
          invalidateExpeditionCaches(undefined, request.starshipId)
          
          console.log('[EXPEDITION-API] ===== CREATE EXPEDITION OPERATION SUCCESS =====');
          return data
        } catch (error) {
          console.error('[EXPEDITION-API] ===== CREATE EXPEDITION OPERATION ERROR =====');
          console.error('[EXPEDITION-API] Error in createExpedition operation:', {
            error,
            errorType: typeof error,
            errorConstructor: error?.constructor?.name,
            errorMessage: (error as any)?.message,
            errorStack: (error as any)?.stack,
            timestamp: new Date().toISOString()
          });
          throw error; // Re-throw to let withRetry handle it
        }
      },
      { maxRetries: options?.retries || DEFAULT_RETRY_CONFIG.maxRetries }
    )
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
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    return withRetry(
      async () => {
        const response = await api.put(
          `/api/starships/${starshipId}/expeditions/${expeditionId}`,
          updates
        )
        const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        return data
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Delete expedition
   */
  deleteExpedition: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<{ message: string }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    return withRetry(
      async () => {
        const response = await api.delete(
          `/api/starships/${starshipId}/expeditions/${expeditionId}`
        )
        const data = validateResponse<{ message: string }>(response.data, ['message'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        return data
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/start`
        )
        const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        return data
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Pause expedition execution
   */
  pauseExpedition: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/pause`
        )
        const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        return data
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Resume expedition execution
   */
  resumeExpedition: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<ExpeditionResponse> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/resume`
        )
        const data = validateResponse<ExpeditionResponse>(response.data.data, ['expedition'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        return data
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Cancel expedition execution
   */
  cancelExpedition: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<{ message: string }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/cancel`
        )
        const data = validateResponse<{ message: string }>(response.data, ['message'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        return data
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_TASKS(expeditionId)
    const cached = apiCache.get<ExpeditionTask[]>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/tasks`
        )
        const data = response.data.data.tasks || []
        apiCache.set(cacheKey, data, 1 * 60 * 1000) // Cache for 1 minute
        return data
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId, taskId }, ['starshipId', 'expeditionId', 'taskId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId)
    const cached = apiCache.get<ExpeditionTask>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}`
        )
        const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task'])
        apiCache.set(cacheKey, data.task, 1 * 60 * 1000)
        return data.task
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Create a new task for an expedition
   */
  createTask: async (
    starshipId: string,
    request: CreateTaskRequest,
    options?: APIOptions
  ): Promise<ExpeditionTask> => {
    validateRequest(request, ['expeditionId', 'title', 'description', 'deliverable'])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${request.expeditionId}/tasks`,
          request
        )
        const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task'])
        invalidateExpeditionCaches(request.expeditionId, starshipId)
        return data.task
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId, taskId }, ['starshipId', 'expeditionId', 'taskId'])

    return withRetry(
      async () => {
        const response = await api.put(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}`,
          updates
        )
        const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        apiCache.invalidate(EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId))
        return data.task
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId, taskId }, ['starshipId', 'expeditionId', 'taskId'])

    return withRetry(
      async () => {
        const response = await api.delete(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}`
        )
        const data = validateResponse<{ message: string }>(response.data, ['message'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        apiCache.invalidate(EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId))
        return data
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId, taskId, agentId }, [
      'starshipId',
      'expeditionId',
      'taskId',
      'agentId',
    ])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}/assign`,
          { agentId }
        )
        const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        apiCache.invalidate(EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId))
        return data.task
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId, taskId }, ['starshipId', 'expeditionId', 'taskId'])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/tasks/${taskId}/complete`,
          { result }
        )
        const data = validateResponse<{ task: ExpeditionTask }>(response.data.data, ['task'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        apiCache.invalidate(EXPEDITION_CACHE_KEYS.TASK_BY_ID(taskId))
        return data.task
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_MESSAGES(expeditionId)
    const cached = apiCache.get<ExpeditionMessage[]>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    try {
      const response = await api.get(
        `/api/starships/${starshipId}/expeditions/${expeditionId}/messages`
      )

      // Handle different response structures gracefully - never throw errors
      let messages: ExpeditionMessage[] = []

      try {
        if (response?.data?.success && response.data.data?.messages) {
          messages = response.data.data.messages
        } else if (response?.data?.data?.messages) {
          messages = response.data.data.messages
        } else if (Array.isArray(response?.data?.data)) {
          messages = response.data.data
        } else if (Array.isArray(response?.data)) {
          messages = response.data
        } else {
          console.warn(
            '[EXPEDITION-API] Unexpected response structure for getMessages:',
            response?.data
          )
          messages = []
        }

        // Ensure we have an array
        if (!Array.isArray(messages)) {
          console.warn('[EXPEDITION-API] Messages is not an array, defaulting to empty array')
          messages = []
        }
      } catch (parseError) {
        console.warn(
          '[EXPEDITION-API] Error parsing messages response, returning empty array:',
          parseError
        )
        messages = []
      }

      apiCache.set(cacheKey, messages, 30 * 1000) // Cache for 30 seconds
      return messages
    } catch (error) {
      console.warn('[EXPEDITION-API] Failed to fetch messages, returning empty array:', error)
      // Return empty array instead of throwing error
      return []
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
    validateRequest({ starshipId, expeditionId, messageId }, [
      'starshipId',
      'expeditionId',
      'messageId',
    ])

    const cacheKey = EXPEDITION_CACHE_KEYS.MESSAGE_BY_ID(messageId)
    const cached = apiCache.get<ExpeditionMessage>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/messages/${messageId}`
        )
        const data = validateResponse<{ message: ExpeditionMessage }>(response.data.data, [
          'message',
        ])
        apiCache.set(cacheKey, data.message, 5 * 60 * 1000)
        return data.message
      },
      { maxRetries: options?.retries }
    )
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
  ): Promise<{
    messages: ExpeditionMessage[]
    pagination: { total: number; limit: number; offset: number; hasMore: boolean }
  }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.RECENT_MESSAGES(expeditionId, limit, offset)
    const cached = apiCache.get<{ messages: ExpeditionMessage[]; pagination: any }>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/messages/recent?limit=${limit}&offset=${offset}`
        )
        const data = validateResponse<{ messages: ExpeditionMessage[]; pagination: any }>(
          response.data.data,
          ['messages', 'pagination']
        )
        apiCache.set(cacheKey, data, 30 * 1000)
        return data
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId, messageId }, [
      'starshipId',
      'expeditionId',
      'messageId',
    ])

    const cacheKey = EXPEDITION_CACHE_KEYS.MESSAGE_THREAD(messageId)
    const cached = apiCache.get<ExpeditionMessage[]>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/messages/${messageId}/thread`
        )
        const data = response.data.data.thread || []
        apiCache.set(cacheKey, data, 2 * 60 * 1000)
        return data
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Send message to an expedition
   */
  sendMessage: async (
    starshipId: string,
    request: SendMessageRequest,
    options?: APIOptions
  ): Promise<{ response: string }> => {
    validateRequest(request, ['expeditionId', 'content', 'messageType'])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${request.expeditionId}/messages`,
          request
        )
        const data = validateResponse<{ response: string }>(response.data.data, ['response'])
        invalidateExpeditionCaches(request.expeditionId, starshipId)
        return data
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_RESULTS(expeditionId)
    const cached = apiCache.get<ExpeditionResult[]>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/results`
        )
        const data = response.data.data.results || []
        apiCache.set(cacheKey, data, 2 * 60 * 1000) // Cache for 2 minutes
        return data
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId, resultId }, [
      'starshipId',
      'expeditionId',
      'resultId',
    ])

    const cacheKey = EXPEDITION_CACHE_KEYS.RESULT_BY_ID(resultId)
    const cached = apiCache.get<ExpeditionResult>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/results/${resultId}`
        )
        const data = validateResponse<{ result: ExpeditionResult }>(response.data.data, ['result'])
        apiCache.set(cacheKey, data.result, 5 * 60 * 1000)
        return data.result
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Create a new expedition result
   */
  createResult: async (
    starshipId: string,
    request: CreateResultRequest,
    options?: APIOptions
  ): Promise<ExpeditionResult> => {
    validateRequest(request, ['expeditionId', 'title', 'content', 'resultType', 'format'])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${request.expeditionId}/results`,
          request
        )
        const data = validateResponse<{ result: ExpeditionResult }>(response.data.data, ['result'])
        invalidateExpeditionCaches(request.expeditionId, starshipId)
        return data.result
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId, resultId }, [
      'starshipId',
      'expeditionId',
      'resultId',
    ])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/results/${resultId}/quality-score`,
          qualityScore
        )
        const data = validateResponse<{ result: ExpeditionResult }>(response.data.data, ['result'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        apiCache.invalidate(EXPEDITION_CACHE_KEYS.RESULT_BY_ID(resultId))
        return data.result
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Get results analytics for an expedition
   */
  getResultsAnalytics: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<{
    totalResults: number
    resultsByType: Record<string, number>
    resultsByFormat: Record<string, number>
    averageQuality: {
      overall: number
      completeness: number
      accuracy: number
      relevance: number
      clarity: number
    }
    qualityDistribution: {
      excellent: number
      good: number
      fair: number
      poor: number
    }
  }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.RESULT_ANALYTICS(expeditionId)
    const cached = apiCache.get<any>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/results/analytics`
        )
        const data = validateResponse<{ analytics: any }>(response.data.data, ['analytics'])
        apiCache.set(cacheKey, data.analytics, 5 * 60 * 1000)
        return data.analytics
      },
      { maxRetries: options?.retries }
    )
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
    validateRequest({ starshipId, expeditionId, resultId }, [
      'starshipId',
      'expeditionId',
      'resultId',
    ])

    return withRetry(
      async () => {
        const response = await api.post(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/results/${resultId}/validate`
        )
        const data = validateResponse<{ validation: any }>(response.data.data, ['validation'])
        invalidateExpeditionCaches(expeditionId, starshipId)
        return data
      },
      { maxRetries: options?.retries }
    )
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
    expedition: Expedition
    isActive: boolean
    progress: any
    taskStats: any
    recentMessages: ExpeditionMessage[]
    lastUpdated: string
  }> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_STATUS(expeditionId)
    const cached = apiCache.get<any>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/status`
        )
        const data = validateResponse<{ status: any }>(response.data.data, ['status'])
        apiCache.set(cacheKey, data.status, 30 * 1000) // Cache for 30 seconds
        return data.status
      },
      { maxRetries: options?.retries },
      true
    ) // Allow null result
  },

  /**
   * Get detailed expedition progress information
   */
  getExpeditionProgress: async (
    starshipId: string,
    expeditionId: string,
    options?: APIOptions
  ): Promise<any> => {
    validateRequest({ starshipId, expeditionId }, ['starshipId', 'expeditionId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_PROGRESS(expeditionId)
    const cached = apiCache.get<any>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(
          `/api/starships/${starshipId}/expeditions/${expeditionId}/progress`
        )
        const data = response.data.data.progress
        if (data) {
          apiCache.set(cacheKey, data, 30 * 1000) // Cache for 30 seconds
        }
        return data
      },
      { maxRetries: options?.retries },
      true
    ) // Allow null result
  },

  /**
   * Get all active expeditions for a starship
   */
  getActiveExpeditions: async (
    starshipId: string,
    options?: APIOptions
  ): Promise<{
    expeditions: (Expedition & { isActivelyProcessing: boolean })[]
    total: number
    activeCount: number
  }> => {
    validateRequest({ starshipId }, ['starshipId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.ACTIVE_EXPEDITIONS(starshipId)
    const cached = apiCache.get<any>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(`/api/starships/${starshipId}/expeditions/active`)
        const data = validateResponse<any>(response.data.data, ['expeditions'])
        apiCache.set(cacheKey, data, 1 * 60 * 1000) // Cache for 1 minute
        return data
      },
      { maxRetries: options?.retries }
    )
  },

  /**
   * Get expedition statistics
   */
  getStats: async (starshipId: string, options?: APIOptions): Promise<ExpeditionStatsResponse> => {
    validateRequest({ starshipId }, ['starshipId'])

    const cacheKey = EXPEDITION_CACHE_KEYS.EXPEDITION_STATS(starshipId)
    const cached = apiCache.get<ExpeditionStatsResponse>(cacheKey)
    if (cached && !options?.skipCache) {
      return cached
    }

    return withRetry(
      async () => {
        const response = await api.get(`/api/starships/${starshipId}/expeditions/stats`)
        const data = validateResponse<ExpeditionStatsResponse>(response.data.data, [
          'totalExpeditions',
        ])
        apiCache.set(cacheKey, data, 5 * 60 * 1000) // Cache for 5 minutes
        return data
      },
      { maxRetries: options?.retries }
    )
  },

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clear all expedition caches
   */
  clearCache: (expeditionId?: string, starshipId?: string) => {
    invalidateExpeditionCaches(expeditionId, starshipId)
  },

  /**
   * Get loading state helper
   */
  createLoadingState: (): LoadingState => ({
    isLoading: false,
    error: null,
    lastUpdated: null,
  }),

  /**
   * Check if an error is retryable
   */
  isRetryableError: (error: ExpeditionAPIError): boolean => {
    return DEFAULT_RETRY_CONFIG.retryCondition({
      response: { status: error.statusCode },
    } as AxiosError)
  },
}

export default expeditionAPI
