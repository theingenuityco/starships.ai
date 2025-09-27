import type { ApiResponse, TemplateCategory } from '@starships/protocol'

import { ConnectorInstanceConfig } from '@/components/crew/ConnectorInstanceConfig'
import { apiCache, CACHE_KEYS, invalidateAgentCaches } from './cache'

// Custom fetch response wrapper to match axios-like interface
interface FetchResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Headers
}

// Interceptor types
type RequestInterceptor = (config: RequestConfig) => Promise<RequestConfig> | RequestConfig
type ResponseInterceptor = (response: FetchResponse) => FetchResponse
type ErrorInterceptor = (error: any) => any

interface RequestConfig extends RequestInit {
  url?: string
  timeout?: number
}

// Custom fetch client with timeout and headers
class FetchClient {
  private timeout: number
  private baseHeaders: Record<string, string>
  private requestInterceptors: RequestInterceptor[] = []
  private responseInterceptors: ResponseInterceptor[] = []
  private errorInterceptors: ErrorInterceptor[] = []

  public interceptors = {
    request: {
      use: (onFulfilled: RequestInterceptor, onRejected?: (error: any) => any) => {
        this.requestInterceptors.push(onFulfilled)
        if (onRejected) this.errorInterceptors.push(onRejected)
      },
    },
    response: {
      use: (onFulfilled: ResponseInterceptor, onRejected?: (error: any) => any) => {
        this.responseInterceptors.push(onFulfilled)
        if (onRejected) this.errorInterceptors.push(onRejected)
      },
    },
  }

  constructor(config: { timeout?: number; headers?: Record<string, string> } = {}) {
    this.timeout = config.timeout || 120000 // 120s (2 minutes)
    this.baseHeaders = config.headers || { 'Content-Type': 'application/json' }
  }

  async request<T = any>(url: string, options: RequestInit = {}): Promise<FetchResponse<T>> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      // Apply request interceptors
      let config: RequestConfig = {
        ...options,
        url,
        headers: {
          ...this.baseHeaders,
          ...((options.headers as Record<string, string>) || {}),
        },
        signal: controller.signal,
      }

      for (const interceptor of this.requestInterceptors) {
        config = await interceptor(config)
      }

      const response = await fetch(config.url || url, config)

      clearTimeout(timeoutId)

      let data: any
      const contentType = response.headers.get('content-type')

      if (contentType && contentType.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`) as any
        error.response = {
          status: response.status,
          statusText: response.statusText,
          data,
          headers: response.headers,
        }
        error.config = { url: config.url || url, method: config.method }

        // Apply error interceptors
        for (const interceptor of this.errorInterceptors) {
          try {
            return interceptor(error)
          } catch (e) {
            // Continue to next interceptor if this one throws
          }
        }

        throw error
      }

      let fetchResponse: FetchResponse<T> = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }

      // Apply response interceptors
      for (const interceptor of this.responseInterceptors) {
        fetchResponse = interceptor(fetchResponse)
      }

      return fetchResponse
    } catch (error: any) {
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        const timeoutError = new Error('Request timeout') as any
        timeoutError.code = 'ECONNABORTED'
        timeoutError.config = { url, method: options.method }
        throw timeoutError
      }

      // Apply error interceptors for network errors
      for (const interceptor of this.errorInterceptors) {
        try {
          return interceptor(error)
        } catch (e) {
          // Continue to next interceptor if this one throws
        }
      }

      throw error
    }
  }

  async get<T = any>(url: string, config: { params?: Record<string, any> } = {}): Promise<FetchResponse<T>> {
    let requestUrl = url
    if (config.params) {
      const searchParams = new URLSearchParams()
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
      if (searchParams.toString()) {
        requestUrl += `?${searchParams.toString()}`
      }
    }
    return this.request<T>(requestUrl, { method: 'GET' })
  }

  async post<T = any>(url: string, data?: any): Promise<FetchResponse<T>> {
    return this.request<T>(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T = any>(url: string, data?: any): Promise<FetchResponse<T>> {
    return this.request<T>(url, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async patch<T = any>(url: string, data?: any): Promise<FetchResponse<T>> {
    return this.request<T>(url, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T = any>(url: string): Promise<FetchResponse<T>> {
    return this.request<T>(url, { method: 'DELETE' })
  }
}

const api = new FetchClient({
  timeout: 120000, // Increased to 120s (2 minutes) for long-running operations
  headers: {
    'Content-Type': 'application/json',
  },
})

// Simple helper to extract data from ApiResponse<T> - enforces response contract
const extractResponseData = <T>(response: FetchResponse<ApiResponse<T>>): T => response.data.data

// Token provider function for dynamic token retrieval
let getTokenFunction: (() => Promise<string | null>) | null = null
let tokenProviderReady = false
const tokenProviderPromises: Array<{ resolve: () => void; reject: (error: Error) => void }> = []

export const setTokenProvider = (tokenProvider: () => Promise<string | null>) => {
  getTokenFunction = tokenProvider
  tokenProviderReady = true

  // Resolve all pending promises waiting for token provider
  tokenProviderPromises.forEach(({ resolve }) => resolve())
  tokenProviderPromises.length = 0
}

// Export function to get current token (for SSE authentication)
export const getCurrentToken = async (): Promise<string | null> => {
  if (!getTokenFunction) {
    return null
  }

  try {
    await waitForTokenProvider()
    return await getTokenFunction()
  } catch (error) {
    return null
  }
}

// Wait for token provider to be ready
const waitForTokenProvider = (): Promise<void> => {
  if (tokenProviderReady) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    tokenProviderPromises.push({ resolve, reject })

    // Add timeout to prevent infinite waiting
    setTimeout(() => {
      const index = tokenProviderPromises.findIndex(p => p.resolve === resolve)
      if (index !== -1) {
        tokenProviderPromises.splice(index, 1)
        reject(new Error('Token provider setup timeout'))
      }
    }, 15000) // 15 second timeout
  })
}

// Request interceptor to add authentication token
api.interceptors.request.use(
  async (config: RequestConfig) => {
    // Check if this is an authenticated endpoint
    const requiresAuth = config.url?.includes('/api/v1/starships') || config.url?.includes('/api/v1/agents') || config.url?.includes('/api/v1/users') || config.url?.includes('/api/v1/conversations')

    if (requiresAuth) {
      try {
        // Wait for token provider to be ready before proceeding
        await waitForTokenProvider()
      } catch (error) {}
    }

    if (getTokenFunction) {
      const token = await getTokenFunction()

      if (token) {
        // Ensure headers is a proper object
        if (!config.headers) {
          config.headers = {}
        }
        const headers = config.headers as Record<string, string>
        headers.Authorization = `Bearer ${token}`
      } else {
      }
    } else {
    }
    return config
  },
  (error: any) => {
    console.error('[API] Request interceptor error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor for auth error handling
api.interceptors.response.use(
  (response: FetchResponse) => response,
  (error: any) => {
    // Enhanced error logging to capture all possible error scenarios
    const errorDetails = {
      message: error.message,
      name: error.name,
      code: error.code,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers,
      // Network error details
      isNetworkError: !error.response,
      isTimeout: error.code === 'ECONNABORTED',
      // Full error object for debugging
      fullError: error.toJSON ? error.toJSON() : 'Error not serializable',
    }

    console.error('[API] Request failed:', errorDetails)

    if (error.response?.status === 401) {
      console.error('[API] Authentication failed - token may be invalid or expired:', error.response.data)
      // TODO: Trigger logout or token refresh
    } else if (error.response?.status === 500) {
      console.error('[API] Server error occurred:', error.response.data)
    } else if (error.response?.status === 409) {
      console.warn('[API] Conflict error (409):', error.response.data)

      // Handle 409 conflicts gracefully
      if (error.config?.url?.includes('/connectors/')) {
        // Return a successful response instead of rejecting
        return Promise.resolve({
          status: 200,
          statusText: 'OK',
          data: { message: 'Already connected' },
          headers: error.response.headers,
        })
      }
    } else if (!error.response) {
      console.error('[API] Network error - no response received:', error.message)
    }

    return Promise.reject(error)
  }
)

// Import Agent and Starship related types from protocol package
import {
  AgentModel,
  AgentTemplateModel,
  CreateAgentRequest,
  CreateStarshipRequest,
  StarshipAgentsResponse,
  StarshipDetailsResponse,
  StarshipListResponse,
  StarshipResponse,
  UpdateAgentRequest,
  UpdateStarshipRequest,
  UpdateStarshipStatusRequest,
} from '@starships/protocol'

// Re-export types for use in other client components
export type {
  CreateAgentRequest,
  CreateStarshipRequest,
  StarshipAgentsResponse,
  StarshipDetailsResponse,
  StarshipListResponse,
  StarshipResponse,
  UpdateAgentRequest,
  UpdateStarshipRequest,
  UpdateStarshipStatusRequest,
}

// For compatibility, alias the types
export type Agent = AgentModel
export type AgentTemplate = AgentTemplateModel

// MCP Server Option interface (matching backend model)
export interface MCPServerOption {
  id: string // Unique identifier (e.g., "github", "puppeteer")
  name: string // Display name (e.g., "Github", "Puppeteer")
  command: string // Execution command (e.g., "docker", "npx", "uvx")
  args: string[] // Command arguments array
  env?: string // Environment variables as JSON string (optional)
}

// NEW: MCP Server Connector Instance interface (matching backend model)
export interface MCPServerConnector {
  id: string
  starshipId: string
  templateId: string
  status: 'active' | 'inactive' | 'error' | 'connecting'
  isActive: boolean
  connectedAt: string
  lastUsed?: string
  errorMessage?: string
  // NEW: Simplified environment variables support
  env?: string
  configTemplateId?: string
  configVersion?: number
  createdAt: string
  updatedAt: string
  // Include template information for UI display
  template?: MCPServerOption
}

export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: string
  conversationId: string
  sending?: boolean // For loading states
}

// User Interface (from backend)
export interface SyncedUser {
  id: string
  email?: string
  displayName?: string
  avatar?: string
  createdAt: string
}

// Export Starship type for backward compatibility
export type Starship = StarshipResponse['starship']

// Legacy chat interfaces removed - use ConversationRequest/Response from protocol package

// API functions with caching
export const agentAPI = {
  getAll: async (): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_ALL
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get('/api/v1/agents').then(res => {
      const agents = extractResponseData<Agent[]>(res)

      return agents
    })
    apiCache.set(cacheKey, data)
    return data
  },

  // Get agents by starship ID
  getByStarshipId: async (starshipId: string): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_BY_STARSHIP(starshipId)
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/v1/starships/${starshipId}/agents`).then(res => extractResponseData<Agent[]>(res))
    apiCache.set(cacheKey, data)
    return data
  },

  getById: async (id: string): Promise<Agent> => {
    const cacheKey = CACHE_KEYS.AGENT_BY_ID(id)
    const cached = apiCache.get<Agent>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/v1/agents/${id}`).then(res => extractResponseData<Agent>(res))
    apiCache.set(cacheKey, data)
    return data
  },

  // CRUD methods with cache invalidation
  create: async (agent: CreateAgentRequest): Promise<Agent> => {
    const data = await api.post('/api/v1/agents', agent).then(res => {
      const agent = extractResponseData<Agent>(res)

      return agent
    })
    invalidateAgentCaches()
    return data
  },

  update: async (id: string, updates: UpdateAgentRequest): Promise<Agent> => {
    const data = await api.put(`/api/v1/agents/${id}`, updates).then(res => extractResponseData<Agent>(res))
    invalidateAgentCaches(id)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/agents/${id}`)
    invalidateAgentCaches(id)
  },

  // Enhanced query methods with caching
  getByCategory: async (category: TemplateCategory): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_BY_CATEGORY(category)
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/v1/agents?category=${category}`).then(res => extractResponseData<Agent[]>(res))
    apiCache.set(cacheKey, data)
    return data
  },

  getByAuthor: async (authorId: string): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_BY_AUTHOR(authorId)
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/v1/users/${authorId}/agents`).then(res => extractResponseData<Agent[]>(res))
    apiCache.set(cacheKey, data)
    return data
  },

  getPublic: async (limit: number = 50, offset: number = 0): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_PUBLIC(limit, offset)
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/v1/agents/public?limit=${limit}&offset=${offset}`).then(res => extractResponseData<Agent[]>(res))
    apiCache.set(cacheKey, data)
    return data
  },

  search: async (query: string): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_SEARCH(query)
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/v1/agents/search?q=${encodeURIComponent(query)}`).then(res => extractResponseData<Agent[]>(res))
    apiCache.set(cacheKey, data, 2 * 60 * 1000) // Cache search results for 2 minutes
    return data
  },

  // Get agent analytics
  getAnalytics: async (id: string): Promise<any> => {
    const data = await api.get(`/api/v1/agents/${id}/analytics`).then(res => extractResponseData<any>(res))
    return data
  },
}

// NEW: Template API
export const templateAPI = {
  getAll: async (): Promise<AgentTemplate[]> => {
    const cacheKey = CACHE_KEYS.TEMPLATES_ALL
    const cached = apiCache.get<AgentTemplate[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get('/api/v1/agent-templates').then(res => extractResponseData<AgentTemplate[]>(res))
    apiCache.set(cacheKey, data)
    return data
  },

  getById: async (id: string): Promise<AgentTemplate> => {
    const cacheKey = CACHE_KEYS.TEMPLATE_BY_ID(id)
    const cached = apiCache.get<AgentTemplate>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/v1/agent-templates/${id}`).then(res => extractResponseData<AgentTemplate>(res))
    apiCache.set(cacheKey, data)
    return data
  },

  getByCategory: async (category: AgentTemplate['category']): Promise<AgentTemplate[]> => {
    const cacheKey = CACHE_KEYS.TEMPLATES_BY_CATEGORY(category)
    const cached = apiCache.get<AgentTemplate[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/v1/agent-templates?category=${category}`).then(res => extractResponseData<AgentTemplate[]>(res))
    apiCache.set(cacheKey, data)
    return data
  },

  getByAuthor: async (authorId: string): Promise<AgentTemplate[]> => {
    const cacheKey = CACHE_KEYS.TEMPLATES_BY_AUTHOR(authorId)
    const cached = apiCache.get<AgentTemplate[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/v1/agent-templates?authorId=${authorId}`).then(res => extractResponseData<AgentTemplate[]>(res))
    apiCache.set(cacheKey, data)
    return data
  },

  createAgentFromTemplate: async (templateId: string, starshipId: string): Promise<Agent> => {
    try {
      const requestBody = { starshipId }

      const data = await api.post(`/api/v1/agent-templates/${templateId}/agents`, requestBody).then(res => extractResponseData<Agent>(res))

      // Invalidate agent caches since we've created a new agent
      invalidateAgentCaches()

      // Also invalidate the specific template cache to update usage count
      apiCache.invalidate(CACHE_KEYS.TEMPLATE_BY_ID(templateId))

      return data
    } catch (error) {
      console.error('Failed to create agent from template:', error)
      throw error // Re-throw to allow proper error handling in UI
    }
  },
}

// Note: chatAPI functionality has been moved to useConversations hooks for better integration with TanStack Query

// Starship types are now imported from protocol package above
// Local Starship interface for backward compatibility

// MCP Server API response types
interface MCPServersResponse {
  mcpServers: MCPServerOption[]
}

interface StarshipConnectorsResponse {
  starshipId: string
  connectedConnectors: MCPServerOption[]
}

// NEW: Connector Instance API response types
interface ConnectorInstancesResponse {
  starshipId: string
  connectorInstances: MCPServerConnector[]
}

interface CreateConnectorInstanceResponse {
  connectorInstance: MCPServerConnector
}

// Deprecated: MCP Server API functionality has been removed
export const mcpServerAPI = {
  // Get all available MCP server options - DEPRECATED
  getAll: async (): Promise<MCPServerOption[]> => {
    console.warn('[API] MCP Server functionality has been removed')
    return []
  },

  // Get connected MCP servers for a starship - DEPRECATED
  getConnectedToStarship: async (starshipId: string): Promise<MCPServerOption[]> => {
    console.warn('[API] MCP Server functionality has been removed for starship:', starshipId)
    return []
  },

  // Connect MCP server to starship - DEPRECATED
  connectToStarship: async (starshipId: string, mcpServerId: string): Promise<void> => {
    console.warn('[API] MCP Server connection functionality has been removed:', {
      starshipId,
      mcpServerId,
    })
    // No-op for compatibility
  },

  // Disconnect MCP server from starship - DEPRECATED
  disconnectFromStarship: async (starshipId: string, mcpServerId: string): Promise<void> => {
    console.warn('[API] MCP Server disconnection functionality has been removed:', {
      starshipId,
      mcpServerId,
    })
    // No-op for compatibility
  },

  // Get connector instances - DEPRECATED
  getConnectorInstances: async (starshipId: string): Promise<MCPServerConnector[]> => {
    console.warn('[API] MCP Connector instances functionality has been removed for starship:', starshipId)
    return []
  },

  // Create connector instance - DEPRECATED
  createConnectorInstance: async (starshipId: string, templateId: string, env?: string): Promise<MCPServerConnector> => {
    console.warn('[API] MCP Connector instance creation has been removed:', {
      starshipId,
      templateId,
    })
    throw new Error('MCP functionality has been removed')
  },

  // Remove connector instance - DEPRECATED
  removeConnectorInstance: async (starshipId: string, connectorId: string): Promise<void> => {
    console.warn('[API] MCP Connector instance removal has been removed:', {
      starshipId,
      connectorId,
    })
    // No-op for compatibility
  },

  // Update connector configuration - DEPRECATED
  updateConnectorConfig: async (starshipId: string, connectorId: string, config: ConnectorInstanceConfig): Promise<MCPServerConnector> => {
    console.warn('[API] MCP Connector configuration update has been removed:', {
      starshipId,
      connectorId,
    })
    throw new Error('MCP functionality has been removed')
  },

  // Apply configuration template - DEPRECATED
  applyConfigTemplate: async (starshipId: string, connectorId: string, templateId: string): Promise<MCPServerConnector> => {
    console.warn('[API] MCP Configuration template application has been removed:', {
      starshipId,
      connectorId,
      templateId,
    })
    throw new Error('MCP functionality has been removed')
  },

  // Get connector configuration - DEPRECATED
  getConnectorConfig: async (
    starshipId: string,
    connectorId: string
  ): Promise<{
    config: ConnectorInstanceConfig
    templateId?: string
    version: number
    lastModified: string
  }> => {
    console.warn('[API] MCP Connector configuration retrieval has been removed:', {
      starshipId,
      connectorId,
    })
    throw new Error('MCP functionality has been removed')
  },

  // Get configuration history - DEPRECATED
  getConnectorConfigHistory: async (
    starshipId: string,
    connectorId: string
    // Removed unused parameter
  ): Promise<any[]> => {
    console.warn('[API] MCP Configuration history retrieval has been removed:', {
      starshipId,
      connectorId,
    })
    return []
  },

  // Rollback connector configuration - DEPRECATED
  rollbackConnectorConfig: async (
    starshipId: string,
    connectorId: string,
    historyId: string
    // Removed unused parameter
  ): Promise<void> => {
    console.warn('[API] MCP Configuration rollback has been removed:', {
      starshipId,
      connectorId,
      historyId,
    })
    // No-op for compatibility
  },
}

export const userAPI = {
  // Get user by ID
  getById: (id: string): Promise<SyncedUser> => api.get(`/api/v1/users/${id}`).then(res => extractResponseData<SyncedUser>(res)),
}

// Utility function for generating client-side IDs
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

// Starship API functions for compatibility
export const starshipAPI = {
  // Get starship by slug
  getStarshipBySlug: async (slug: string): Promise<{ starship: Starship }> => {
    const response = await api.get(`/api/v1/starships/${slug}`)
    const data = extractResponseData<{ starship: Starship; agents: any[]; availableSlots: number }>(response)
    return { starship: data.starship }
  },

  // Get user's starships list
  getUserStarshipsList: async (): Promise<Starship[]> => {
    const response = await api.get('/api/v1/starships')
    const data = extractResponseData<Starship[]>(response)
    return data
  },

  // Create billing portal session
  createBillingPortal: async (starshipId: string): Promise<{ url: string }> => {
    const response = await api.post(`/api/v1/starships/${starshipId}/billing-portal`)
    return response.data
  },

  // Retry payment for starship
  retryPayment: async (starshipId: string): Promise<{ checkoutUrl: string; message: string }> => {
    const response = await api.post(`/api/v1/starships/${starshipId}/retry-payment`)
    return response.data
  },
}

export default api
