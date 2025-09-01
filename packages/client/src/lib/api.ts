import axios, { AxiosResponse } from 'axios'

import { getApiBaseUrl } from './env'
import {
  apiCache,
  CACHE_KEYS,
  invalidateAgentCaches,
  invalidateConnectorInstanceCaches,
} from './cache'
import { ConnectorInstanceConfig } from '@/components/crew/ConnectorInstanceConfig'

const API_BASE_URL = getApiBaseUrl()

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // Increased to 120s (2 minutes) for long-running operations
  headers: {
    'Content-Type': 'application/json',
  },
})

// Token provider function for dynamic token retrieval
let getTokenFunction: (() => Promise<string | null>) | null = null
let tokenProviderReady = false
const tokenProviderPromises: Array<{ resolve: () => void; reject: (error: Error) => void }> = []

export const setTokenProvider = (tokenProvider: () => Promise<string | null>) => {
  getTokenFunction = tokenProvider
  tokenProviderReady = true
  console.log('[API] Token provider set')

  // Resolve all pending promises waiting for token provider
  tokenProviderPromises.forEach(({ resolve }) => resolve())
  tokenProviderPromises.length = 0
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
  async config => {
    console.log(
      '[API] Request interceptor running for:',
      config.url,
      'at',
      new Date().toISOString()
    )

    // Check if this is an authenticated endpoint
    const requiresAuth =
      config.url?.includes('/api/starships') ||
      config.url?.includes('/api/agents') ||
      config.url?.includes('/api/users') ||
      config.url?.includes('/api/chat')

    if (requiresAuth) {
      console.log('[API] Authenticated endpoint detected, waiting for token provider...')

      try {
        // Wait for token provider to be ready before proceeding
        await waitForTokenProvider()
        console.log('[API] Token provider ready, proceeding with request')
      } catch (error) {
        console.error('[API] Token provider timeout, proceeding without token:', error)
      }
    }

    console.log('[API] Token provider status:', {
      hasTokenFunction: !!getTokenFunction,
      tokenProviderReady,
      requiresAuth,
      timestamp: new Date().toISOString(),
    })

    if (getTokenFunction) {
      const token = await getTokenFunction()
      console.log('[API] Token from provider:', token ? 'Token present' : 'No token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        console.log('[API] Authorization header added successfully')
      } else {
        console.log('[API] No token available, proceeding without Authorization header')
      }
    } else {
      console.warn('[API] ⚠️  NO TOKEN PROVIDER CONFIGURED - Request may fail with 401/404')
      console.log('[API] Request details:', {
        url: config.url,
        method: config.method,
        requiresAuth,
        timestamp: new Date().toISOString(),
      })
    }
    return config
  },
  error => {
    console.error('[API] Request interceptor error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor for auth error handling
api.interceptors.response.use(
  response => response,
  error => {
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
      console.error(
        '[API] Authentication failed - token may be invalid or expired:',
        error.response.data
      )
      // TODO: Trigger logout or token refresh
    } else if (error.response?.status === 500) {
      console.error('[API] Server error occurred:', error.response.data)
    } else if (error.response?.status === 409) {
      console.warn('[API] Conflict error (409):', error.response.data)

      // Handle 409 conflicts gracefully
      if (error.config?.url?.includes('/connectors/')) {
        console.log('[API] Interceptor handling 409 for connector operation - treating as success')
        // Return a successful response instead of rejecting
        return Promise.resolve({
          status: 200,
          statusText: 'OK',
          data: { message: 'Already connected' },
          headers: error.response.headers,
          config: error.config,
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
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentTemplateModel,
  UpdateStarshipRequest,
  UpdateStarshipStatusRequest,
  StarshipResponse,
  StarshipAgentsResponse,
  StarshipListResponse,
  StarshipDetailsResponse,
  CreateStarshipRequest,
  ChatSession,
} from '@starships/protocol'

// Re-export types for use in other client components
export type {
  CreateAgentRequest,
  UpdateAgentRequest,
  UpdateStarshipRequest,
  UpdateStarshipStatusRequest,
  StarshipResponse,
  StarshipAgentsResponse,
  StarshipListResponse,
  StarshipDetailsResponse,
  CreateStarshipRequest,
  ChatSession
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
  sessionId: string
  sending?: boolean // For loading states
}

// User Interface (from backend)
export interface SyncedUser {
  id: string
  kindeId?: string
  username: string
  email?: string
  displayName?: string
  avatar?: string
  createdAt: string
}

// Export Starship type for backward compatibility
export type Starship = StarshipResponse['starship']


// Backend request/response types (snake_case)
interface ChatBackendRequest {
  agent_id: string
  message: string
  stream?: boolean
}

interface ChatBackendResponse {
  reply: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
  }
}

// Client-friendly request type (camelCase) - user_id now derived from auth token
export interface ChatRequest {
  agentId: string
  sessionId?: string
  message: string
}

// Utility to convert camelCase to snake_case for backend
function toBackendRequest(req: ChatRequest): ChatBackendRequest {
  return {
    agent_id: req.agentId,
    message: req.message,
    stream: false,
  }
}

// API functions with caching
export const agentAPI = {
  getAll: async (): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_ALL
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      console.log('[API] Using cached agents:', cached.length)
      return cached
    }

    console.log('[API] Fetching all agents from server')
    const data = await api.get('/api/agents').then((res: AxiosResponse<Agent[]>) => {
      console.log('[API] Received agents from server:', res.data.length)
      return res.data
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

    const data = await api
      .get(`/api/agents/starship/${starshipId}`)
      .then((res: AxiosResponse<Agent[]>) => res.data)
    apiCache.set(cacheKey, data)
    return data
  },

  getById: async (id: string): Promise<Agent> => {
    const cacheKey = CACHE_KEYS.AGENT_BY_ID(id)
    const cached = apiCache.get<Agent>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/agents/${id}`).then((res: AxiosResponse<Agent>) => res.data)
    apiCache.set(cacheKey, data)
    return data
  },

  // CRUD methods with cache invalidation
  create: async (agent: CreateAgentRequest): Promise<Agent> => {
    console.log('[API] Creating new agent:', agent.name)
    const data = await api.post('/api/agents', agent).then((res: AxiosResponse<Agent>) => {
      console.log('[API] Agent created successfully:', res.data.id, 'authorId:', res.data.authorId)
      return res.data
    })
    console.log('[API] Invalidating agent caches after creation')
    invalidateAgentCaches()
    return data
  },

  update: async (id: string, updates: UpdateAgentRequest): Promise<Agent> => {
    const data = await api
      .put(`/api/agents/${id}`, updates)
      .then((res: AxiosResponse<Agent>) => res.data)
    invalidateAgentCaches(id)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/agents/${id}`)
    invalidateAgentCaches(id)
  },

  // Enhanced query methods with caching
  getByCategory: async (category: Agent['category']): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_BY_CATEGORY(category)
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api
      .get(`/api/agents?category=${category}`)
      .then((res: AxiosResponse<Agent[]>) => res.data)
    apiCache.set(cacheKey, data)
    return data
  },

  getByAuthor: async (authorId: string): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_BY_AUTHOR(authorId)
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api
      .get(`/api/agents?authorId=${authorId}`)
      .then((res: AxiosResponse<Agent[]>) => res.data)
    apiCache.set(cacheKey, data)
    return data
  },

  getPublic: async (limit: number = 50, offset: number = 0): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_PUBLIC(limit, offset)
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api
      .get(`/api/agents/public?limit=${limit}&offset=${offset}`)
      .then((res: AxiosResponse<Agent[]>) => res.data)
    apiCache.set(cacheKey, data)
    return data
  },

  search: async (query: string): Promise<Agent[]> => {
    const cacheKey = CACHE_KEYS.AGENTS_SEARCH(query)
    const cached = apiCache.get<Agent[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api
      .get(`/api/agents/search?q=${encodeURIComponent(query)}`)
      .then((res: AxiosResponse<Agent[]>) => res.data)
    apiCache.set(cacheKey, data, 2 * 60 * 1000) // Cache search results for 2 minutes
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

    const data = await api
      .get('/api/agent-templates')
      .then((res: AxiosResponse<AgentTemplate[]>) => res.data)
    apiCache.set(cacheKey, data)
    return data
  },

  getById: async (id: string): Promise<AgentTemplate> => {
    const cacheKey = CACHE_KEYS.TEMPLATE_BY_ID(id)
    const cached = apiCache.get<AgentTemplate>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api
      .get(`/api/agent-templates/${id}`)
      .then((res: AxiosResponse<AgentTemplate>) => res.data)
    apiCache.set(cacheKey, data)
    return data
  },

  getByCategory: async (category: AgentTemplate['category']): Promise<AgentTemplate[]> => {
    const cacheKey = CACHE_KEYS.TEMPLATES_BY_CATEGORY(category)
    const cached = apiCache.get<AgentTemplate[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api
      .get(`/api/agent-templates?category=${category}`)
      .then((res: AxiosResponse<AgentTemplate[]>) => res.data)
    apiCache.set(cacheKey, data)
    return data
  },

  getByAuthor: async (authorId: string): Promise<AgentTemplate[]> => {
    const cacheKey = CACHE_KEYS.TEMPLATES_BY_AUTHOR(authorId)
    const cached = apiCache.get<AgentTemplate[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api
      .get(`/api/agent-templates?authorId=${authorId}`)
      .then((res: AxiosResponse<AgentTemplate[]>) => res.data)
    apiCache.set(cacheKey, data)
    return data
  },

  createAgentFromTemplate: async (
    templateId: string,
    agentName: string,
    starshipId?: string
  ): Promise<Agent> => {
    try {
      const requestBody: { agentName: string; starshipId?: string } = { agentName }
      if (starshipId) {
        requestBody.starshipId = starshipId
      }

      const data = await api
        .post(`/api/agent-templates/${templateId}/create-agent`, requestBody)
        .then((res: AxiosResponse<Agent>) => res.data)

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

  // Convert a public agent to a template
  convertAgentToTemplate: async (agentId: string): Promise<AgentTemplate> => {
    try {
      console.log('[API] Converting agent to template:', agentId)
      const data = await api
        .post(`/api/agent-templates/convert-from-agent/${agentId}`)
        .then((res: AxiosResponse<AgentTemplate>) => {
          console.log('[API] Agent converted to template successfully:', res.data.id)
          return res.data
        })

      // Invalidate both agent and template caches
      invalidateAgentCaches()
      apiCache.invalidatePattern('^templates:')

      return data
    } catch (error) {
      console.error('Failed to convert agent to template:', error)
      throw error // Re-throw to allow proper error handling in UI
    }
  },
}

export const chatAPI = {
  // Send message directly to /api/chat endpoint
  sendMessage: async (request: ChatRequest): Promise<Message> => {
    const backendRequest = toBackendRequest(request)
    const response = await api.post('/api/chat', backendRequest)
    const backendResponse = response.data as ChatBackendResponse

    // Convert backend response to client Message format
    return {
      id: generateId(),
      content: backendResponse.reply,
      role: 'assistant',
      timestamp: new Date().toISOString(),
      sessionId: request.sessionId || `agent-${request.agentId}`,
    }
  },

  // Get chat messages by session ID from database
  getMessagesBySession: async (sessionId: string, limit: number = 50, offset: number = 0): Promise<Message[]> => {
    const response = await api.get(`/api/chat/messages/${sessionId}`, {
      params: { limit, offset }
    })
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch messages')
    }

    // Convert database messages to client Message format
    const dbMessages = response.data.data.messages
    return dbMessages.map((dbMsg: any) => ({
      id: dbMsg.id,
      content: dbMsg.content,
      role: dbMsg.role as 'user' | 'assistant',
      timestamp: dbMsg.timestamp,
      sessionId: dbMsg.session_id,
      ...(dbMsg.structured_content && { structuredContent: dbMsg.structured_content })
    }))
  },

  // Get chat sessions by starship ID
  getSessionsByStarship: (starshipId: string): Promise<{ sessions: ChatSession[] }> =>
    api
      .get(`/api/chat/sessions/starship/${starshipId}`)
      .then((res: AxiosResponse<{ sessions: ChatSession[] }>) => res.data),

  // Clear memory for a session
  clearMemory: (sessionId: string): Promise<{ message: string }> =>
    api
      .delete(`/api/chat/${sessionId}/memory`)
      .then((res: AxiosResponse<{ message: string }>) => res.data),
}

// Starship types are now imported from protocol package above
// Local Starship interface for backward compatibility

// NEW: Enhanced Starship API
export const starshipAPI = {
  // Get user's starships
  getUserStarships: (): Promise<{ starships: Starship[] }> =>
    api.get('/api/starships').then(res => res.data),

  // Get user's starships list (simple list for dropdowns)
  getUserStarshipsList: async (): Promise<Starship[]> => {
    const cacheKey = 'starships:list'
    const cached = apiCache.get<Starship[]>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get('/api/starships').then(res => res.data.starships)
    apiCache.set(cacheKey, data, 2 * 60 * 1000) // Cache for 2 minutes
    return data
  },

  // Create new starship
  createStarship: (data: {
    name: string
    class: 'scout' | 'cruiser' | 'draught'
  }): Promise<{ starship: Starship }> => {
    return api.post('/api/starships', data).then(res => res.data);
  },

  // Get starship details with caching (supports both ID and slug)
  getStarship: async (
    idOrSlug: string
  ): Promise<{ starship: Starship; agents: Agent[]; availableSlots: number }> => {
    const cacheKey = CACHE_KEYS.STARSHIP_BY_ID(idOrSlug)
    const cached = apiCache.get<{ starship: Starship; agents: Agent[]; availableSlots: number }>(
      cacheKey
    )
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/starships/${idOrSlug}`).then(res => res.data)
    apiCache.set(cacheKey, data, 2 * 60 * 1000) // Cache for 2 minutes since starship data changes frequently
    return data
  },

  // Get starship by slug specifically
  getStarshipBySlug: async (
    slug: string
  ): Promise<{ starship: Starship; agents: Agent[]; availableSlots: number }> => {
    return starshipAPI.getStarship(slug)
  },

  // Update starship details with cache invalidation
  updateStarship: async (id: string, updates: UpdateStarshipRequest): Promise<StarshipResponse> => {
    const data = await api.put(`/api/starships/${id}`, updates).then(res => res.data)
    // Invalidate starship cache since details changed
    apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(id))
    apiCache.invalidatePattern('^starships:') // Invalidate all starship caches
    return data
  },

  // Delete starship with cache invalidation
  deleteStarship: async (id: string): Promise<{ 
    message: string;
    starshipId: string;
    subscriptionCancelled: boolean;
    refundInfo: string | null;
  }> => {
    const data = await api.delete(`/api/starships/${id}`).then(res => res.data)
    // Invalidate all starship caches
    apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(id))
    apiCache.invalidatePattern('^starships:')
    return data
  },

  // Update starship status specifically with cache invalidation
  updateStarshipStatus: async (
    id: string,
    status: UpdateStarshipStatusRequest['status']
  ): Promise<StarshipResponse> => {
    const data = await api.patch(`/api/starships/${id}/status`, { status }).then(res => res.data)
    // Invalidate starship cache since status changed
    apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(id))
    apiCache.invalidatePattern('^starships:')
    return data
  },

  // Get detailed agent information for starship
  getStarshipAgents: async (id: string): Promise<StarshipAgentsResponse> => {
    const cacheKey = CACHE_KEYS.STARSHIP_AGENTS(id)
    const cached = apiCache.get<StarshipAgentsResponse>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/starships/${id}/agents`).then(res => res.data)
    apiCache.set(cacheKey, data, 1 * 60 * 1000) // Cache for 1 minute since agent data changes frequently
    return data
  },

  // Deploy agent to starship with cache invalidation
  deployAgent: async (starshipId: string, agentId: string): Promise<{ message: string }> => {
    const data = await api
      .post(`/api/starships/${starshipId}/agents/${agentId}/deploy`)
      .then(res => res.data)
    // Invalidate starship cache since agent deployment changes starship state
    apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
    apiCache.invalidate(CACHE_KEYS.STARSHIP_AGENTS(starshipId))
    return data
  },

  // Remove agent from starship with cache invalidation
  removeAgent: async (starshipId: string, agentId: string): Promise<{ message: string }> => {
    const data = await api
      .delete(`/api/starships/${starshipId}/agents/${agentId}`)
      .then(res => res.data)
    // Invalidate starship cache since agent removal changes starship state
    apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
    apiCache.invalidate(CACHE_KEYS.STARSHIP_AGENTS(starshipId))
    return data
  },
}


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
    console.warn('[API] MCP Server connection functionality has been removed:', { starshipId, mcpServerId })
    // No-op for compatibility
  },

  // Disconnect MCP server from starship - DEPRECATED
  disconnectFromStarship: async (starshipId: string, mcpServerId: string): Promise<void> => {
    console.warn('[API] MCP Server disconnection functionality has been removed:', { starshipId, mcpServerId })
    // No-op for compatibility
  },

  // Get connector instances - DEPRECATED
  getConnectorInstances: async (starshipId: string): Promise<MCPServerConnector[]> => {
    console.warn('[API] MCP Connector instances functionality has been removed for starship:', starshipId)
    return []
  },

  // Create connector instance - DEPRECATED
  createConnectorInstance: async (
    starshipId: string,
    templateId: string,
    env?: string
  ): Promise<MCPServerConnector> => {
    console.warn('[API] MCP Connector instance creation has been removed:', { starshipId, templateId })
    throw new Error('MCP functionality has been removed')
  },

  // Remove connector instance - DEPRECATED
  removeConnectorInstance: async (starshipId: string, connectorId: string): Promise<void> => {
    console.warn('[API] MCP Connector instance removal has been removed:', { starshipId, connectorId })
    // No-op for compatibility
  },

  // Update connector configuration - DEPRECATED
  updateConnectorConfig: async (
    starshipId: string,
    connectorId: string,
    config: ConnectorInstanceConfig
  ): Promise<MCPServerConnector> => {
    console.warn('[API] MCP Connector configuration update has been removed:', { starshipId, connectorId })
    throw new Error('MCP functionality has been removed')
  },

  // Apply configuration template - DEPRECATED
  applyConfigTemplate: async (
    starshipId: string,
    connectorId: string,
    templateId: string
  ): Promise<MCPServerConnector> => {
    console.warn('[API] MCP Configuration template application has been removed:', { starshipId, connectorId, templateId })
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
    console.warn('[API] MCP Connector configuration retrieval has been removed:', { starshipId, connectorId })
    throw new Error('MCP functionality has been removed')
  },

  // Get configuration history - DEPRECATED
  getConnectorConfigHistory: async (
    starshipId: string,
    connectorId: string,
    // Removed unused parameter
  ): Promise<any[]> => {
    console.warn('[API] MCP Configuration history retrieval has been removed:', { starshipId, connectorId })
    return []
  },

  // Rollback connector configuration - DEPRECATED
  rollbackConnectorConfig: async (
    starshipId: string,
    connectorId: string,
    historyId: string,
    // Removed unused parameter
  ): Promise<void> => {
    console.warn('[API] MCP Configuration rollback has been removed:', { starshipId, connectorId, historyId })
    // No-op for compatibility
  },
}


export const userAPI = {
  // Sync Kinde user to backend database
  syncUser: async (userData: {
    kindeId: string
    email: string
    name?: string
    avatar?: string
  }): Promise<SyncedUser> => {
    const response = await api.post('/api/users/sync', userData)
    return response.data as SyncedUser
  },

  // Get user by ID
  getById: (id: string): Promise<SyncedUser> =>
    api.get(`/api/users/${id}`).then((res: AxiosResponse<SyncedUser>) => res.data),

  // Get user by Kinde ID
  getByKindeId: (kindeId: string): Promise<SyncedUser> =>
    api.get(`/api/users/kinde/${kindeId}`).then((res: AxiosResponse<SyncedUser>) => res.data),
}


// Utility function for generating client-side IDs
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export default api
