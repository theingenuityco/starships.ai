import axios, { AxiosResponse } from 'axios'

import { getApiBaseUrl } from './env'
import {
  apiCache,
  CACHE_KEYS,
  invalidateAgentCaches,
  invalidateMCPServerCaches,
  invalidateConnectorInstanceCaches,
} from './cache'
import { SubscriptionPlan } from '@/types/subscriptions'

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
      config.url?.includes('/api/users')

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

      // Handle 409 conflicts for MCP server connections gracefully
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

// Import Agent and related types from protocol package
import {
  Agent,
  AgentConfig,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentTemplate,
} from '@starships/protocol'

// Re-export Agent types for use in other client components
export type { Agent, AgentConfig, CreateAgentRequest, UpdateAgentRequest, AgentTemplate }

// MCP Server Option interface (matching backend model)
export interface MCPServerOption {
  id: string // Unique identifier (e.g., "github", "puppeteer")
  name: string // Display name (e.g., "Github", "Puppeteer")
  command: string // Execution command (e.g., "docker", "npx", "uvx")
  args: string[] // Command arguments array
  env?: string // Environment variables as JSON string (optional)
}

// Configuration history interface
export interface ConnectorConfigHistory {
  id: string
  connectorId: string
  config: ConnectorInstanceConfig
  changedBy: string
  changeSummary?: string
  changeReason?: string
  createdAt: string
}

// Configuration template interface
export interface ConnectorConfigTemplate {
  id: string
  name: string
  description?: string
  category: 'development' | 'production' | 'testing' | 'monitoring' | 'custom'
  tags: string[]
  config: ConnectorInstanceConfig
  isPublic: boolean
  authorId: string
  usageCount: number
  createdAt: string
  updatedAt: string
}

// Configuration interface for connector instances
export interface ConnectorInstanceConfig {
  customName?: string
  customDescription?: string
  environmentVariables?: string
  timeouts?: {
    connection?: number
    request?: number
    idle?: number
  }
  retry?: {
    maxAttempts?: number
    baseDelay?: number
    maxDelay?: number
    exponentialBackoff?: boolean
  }
  logging?: {
    level?: 'error' | 'warn' | 'info' | 'debug'
    enableDebug?: boolean
    logRequests?: boolean
    logMetrics?: boolean
  }
  resources?: {
    maxMemoryMB?: number
    maxCpuPercent?: number
    maxConnections?: number
  }
  healthCheck?: {
    enabled?: boolean
    interval?: number
    timeout?: number
    failureThreshold?: number
  }
  customConfig?: Record<string, any>
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

// NEW: Starship interfaces
export interface Starship {
  id: string
  slug: string
  name: string
  class: 'scout' | 'cruiser'
  ownerId: string
  status: 'active' | 'inactive'
  maxAgents: number
  maxActiveExpeditions: number
  createdAt: string
  updatedAt: string
}

export interface Vision {
  id: string
  starshipId: string
  statement: string
  confidence: number
  lastRefined: string
  refinementCount: number
  updatedAt: string
}

// Backend request/response types (snake_case)
interface ChatBackendRequest {
  agent_id: string
  channel_id?: string
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
    channel_id: req.sessionId,
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

  // Clear memory for a session
  clearMemory: (sessionId: string): Promise<{ message: string }> =>
    api
      .delete(`/api/chat/${sessionId}/memory`)
      .then((res: AxiosResponse<{ message: string }>) => res.data),
}

// Define starship API types locally since they're not exported from protocol
interface UpdateStarshipRequest {
  name?: string
  status?: 'active' | 'inactive'
  class?: 'scout' | 'cruiser'
  maxActiveExpeditions?: number
}

interface UpdateStarshipStatusRequest {
  status: 'active' | 'inactive'
}

interface StarshipResponse {
  starship: Starship
}

interface StarshipAgentsResponse {
  starshipId: string
  starshipName: string
  starshipClass: 'scout' | 'cruiser'
  maxAgents: number
  deployedAgents: Array<{
    id: string
    name: string
    model: string
    systemPrompt?: string
    createdAt: string
    description?: string
    tags: string[]
    category: 'general' | 'coding' | 'creative' | 'analysis' | 'support'
    authorId: string
    isPublic: boolean
    version: string
    updatedAt: string
    usageCount: number
    rating?: number
    temperature?: number
    maxTokens?: number
    customInstructions?: string
    allowedStarshipClasses?: ('scout' | 'cruiser')[]
    requiredPermissions?: string[]
  }>
  availableSlots: number
  deployedCount: number
}

interface StarshipDetailsResponse extends StarshipResponse {
  agents: StarshipAgentsResponse['deployedAgents']
  availableSlots: number
}

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
    class: 'scout' | 'cruiser'
    maxActiveExpeditions?: number
  }): Promise<{ starship: Starship }> => api.post('/api/starships', data).then(res => res.data),

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
  deleteStarship: async (id: string): Promise<{ message: string }> => {
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

// NEW: Vision API
export const visionAPI = {
  get: (starshipId: string): Promise<{ vision: string }> =>
    api.get(`/api/starships/${starshipId}/vision`).then(res => res.data),

  save: (starshipId: string, vision: string): Promise<{ success: boolean }> =>
    api.post(`/api/starships/${starshipId}/vision`, { vision }).then(res => res.data),
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

// NEW: MCP Server API
export const mcpServerAPI = {
  // Get all available MCP server options with 5-minute caching
  getAll: async (): Promise<MCPServerOption[]> => {
    const cacheKey = CACHE_KEYS.MCP_SERVERS_ALL
    const cached = apiCache.get<MCPServerOption[]>(cacheKey)
    if (cached) {
      console.log('[API] Using cached MCP servers:', cached.length)
      return cached
    }

    console.log('[API] Fetching all MCP servers from server')
    const data = await api
      .get('/api/mcp-servers')
      .then((res: AxiosResponse<MCPServersResponse>) => {
        console.log('[API] Received MCP servers from server:', res.data.mcpServers.length)
        return res.data.mcpServers
      })

    // Cache for 5 minutes (rarely changes)
    apiCache.set(cacheKey, data, 5 * 60 * 1000)
    return data
  },

  // Get connected MCP servers for a starship with 1-minute caching
  getConnectedToStarship: async (starshipId: string): Promise<MCPServerOption[]> => {
    const cacheKey = CACHE_KEYS.MCP_SERVERS_BY_STARSHIP(starshipId)
    const cached = apiCache.get<MCPServerOption[]>(cacheKey)
    if (cached) {
      console.log(
        '[API] Using cached connected MCP servers for starship:',
        starshipId,
        cached.length
      )
      return cached
    }

    console.log('[API] Fetching connected MCP servers for starship:', starshipId)
    const data = await api
      .get(`/api/starships/${starshipId}/connectors`)
      .then((res: AxiosResponse<StarshipConnectorsResponse>) => {
        console.log(
          '[API] Received connected MCP servers for starship:',
          starshipId,
          res.data.connectedConnectors.length
        )
        return res.data.connectedConnectors
      })

    // Cache for 1 minute (changes more frequently)
    apiCache.set(cacheKey, data, 1 * 60 * 1000)
    return data
  },

  // Connect MCP server to starship with cache invalidation
  connectToStarship: async (starshipId: string, mcpServerId: string): Promise<void> => {
    console.log('[API] Connecting MCP server to starship:', { starshipId, mcpServerId })

    try {
      await api.post(`/api/starships/${starshipId}/connectors/${mcpServerId}`)
      console.log('[API] Successfully connected MCP server to starship')

      // Invalidate relevant caches
      invalidateMCPServerCaches(starshipId)

      // Also invalidate starship cache since connector state changed
      apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
    } catch (error: any) {
      console.log('[API] Caught error in connectToStarship:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      })

      // Handle 409 Conflict as success - connector is already connected
      if (error.response?.status === 409) {
        console.log('[API] MCP server already connected to starship (409) - treating as success')

        // Still invalidate caches to ensure UI is up to date
        invalidateMCPServerCaches(starshipId)
        apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))

        console.log('[API] Successfully handled 409 conflict, returning without error')
        return
      }

      console.error('[API] Failed to connect MCP server to starship:', error)
      throw error
    }
  },

  // Disconnect MCP server from starship with cache invalidation
  disconnectFromStarship: async (starshipId: string, mcpServerId: string): Promise<void> => {
    console.log('[API] Disconnecting MCP server from starship:', { starshipId, mcpServerId })

    try {
      await api.delete(`/api/starships/${starshipId}/connectors/${mcpServerId}`)
      console.log('[API] Successfully disconnected MCP server from starship')

      // Invalidate relevant caches
      invalidateMCPServerCaches(starshipId)

      // Also invalidate starship cache since connector state changed
      apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
    } catch (error: any) {
      // Handle 404 Not Found as success - connector is already disconnected
      if (error.response?.status === 404) {
        console.log(
          '[API] MCP server already disconnected from starship (404) - treating as success'
        )

        // Still invalidate caches to ensure UI is up to date
        invalidateMCPServerCaches(starshipId)
        apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
        return
      }

      console.error('[API] Failed to disconnect MCP server from starship:', error)
      throw error
    }
  },

  // NEW: Connector Instance Methods
  // Get connector instances for a starship with 1-minute caching
  getConnectorInstances: async (starshipId: string): Promise<MCPServerConnector[]> => {
    const cacheKey = CACHE_KEYS.CONNECTOR_INSTANCES_BY_STARSHIP(starshipId)
    const cached = apiCache.get<MCPServerConnector[]>(cacheKey)
    if (cached) {
      console.log('[API] Using cached connector instances for starship:', starshipId, cached.length)
      return cached
    }

    console.log('[API] Fetching connector instances for starship:', starshipId)
    const data = await api
      .get(`/api/starships/${starshipId}/connectors`)
      .then((res: AxiosResponse<{ starshipId: string; connectedConnectors: any[] }>) => {
        console.log(
          '[API] Received connector instances for starship:',
          starshipId,
          res.data.connectedConnectors.length
        )
        // Transform the response to match MCPServerConnector interface
        return res.data.connectedConnectors.map(connector => ({
          id: connector.id,
          starshipId: starshipId,
          templateId: connector.templateId,
          status: connector.status,
          isActive: connector.isActive,
          connectedAt: connector.connectedAt,
          lastUsed: connector.lastUsed,
          errorMessage: connector.errorMessage,
          createdAt: connector.createdAt,
          updatedAt: connector.updatedAt,
          template: {
            id: connector.templateId,
            name: connector.name,
            command: connector.command,
            args: connector.args,
            env: connector.env,
          },
        }))
      })

    // Cache for 1 minute (changes more frequently)
    apiCache.set(cacheKey, data, 1 * 60 * 1000)
    return data
  },

  // Create connector instance from template with cache invalidation
  createConnectorInstance: async (
    starshipId: string,
    templateId: string,
    env?: string
  ): Promise<MCPServerConnector> => {
    console.log('[API] Creating connector instance for starship:', {
      starshipId,
      templateId,
      hasEnv: !!env,
    })

    try {
      const requestBody = env ? { env } : {}

      const data = await api
        .post(`/api/starships/${starshipId}/connectors/${templateId}`, requestBody, {
          timeout: 120000 // 120 seconds (2 minutes) timeout for connector creation
        })
        .then((res: AxiosResponse<any>) => {
          console.log('[API] Successfully created connector instance:', res.data.connectorId)
          // Transform response to match MCPServerConnector interface
          return {
            id: res.data.connectorId,
            starshipId: res.data.starshipId,
            templateId: res.data.templateId,
            status: res.data.status,
            isActive: true,
            connectedAt: res.data.connectedAt,
            createdAt: res.data.createdAt,
            updatedAt: res.data.createdAt,
            env: res.data.env,
          }
        })

      // Invalidate relevant caches
      invalidateConnectorInstanceCaches(starshipId)

      // Also invalidate starship cache since connector state changed
      apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))

      return data
    } catch (error: any) {
      console.log('[API] Caught error in createConnectorInstance:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      })

      // Handle 200 success for already connected - backend returns 200 for idempotent operation
      if (error.response?.status === 200 || error.response?.data?.alreadyConnected) {
        console.log('[API] Connector instance already exists - treating as success')

        // Still invalidate caches to ensure UI is up to date
        invalidateConnectorInstanceCaches(starshipId)
        apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))

        // Return the existing instance info
        return {
          id: error.response.data.connectorId,
          starshipId: error.response.data.starshipId,
          templateId: error.response.data.templateId,
          status: error.response.data.status,
          isActive: true,
          connectedAt: error.response.data.connectedAt,
          createdAt: error.response.data.connectedAt,
          updatedAt: error.response.data.connectedAt,
          env: error.response.data.env,
        }
      }

      console.error('[API] Failed to create connector instance:', error)
      throw error
    }
  },

  // Remove connector instance with cache invalidation
  removeConnectorInstance: async (starshipId: string, connectorId: string): Promise<void> => {
    console.log('[API] Removing connector instance from starship:', { starshipId, connectorId })

    try {
      await api.delete(`/api/starships/${starshipId}/connectors/${connectorId}`, {
        timeout: 30000 // 30 seconds timeout for connector removal
      })
      console.log('[API] Successfully removed connector instance from starship')

      // Invalidate relevant caches
      invalidateConnectorInstanceCaches(starshipId)

      // Also invalidate starship cache since connector state changed
      apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
    } catch (error: any) {
      // Handle 404 Not Found as success - connector instance is already removed
      if (error.response?.status === 404) {
        console.log(
          '[API] Connector instance already removed from starship (404) - treating as success'
        )

        // Still invalidate caches to ensure UI is up to date
        invalidateConnectorInstanceCaches(starshipId)
        apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
        return
      }

      console.error('[API] Failed to remove connector instance from starship:', error)
      throw error
    }
  },

  // NEW: Configuration Management Methods
  // Update connector instance configuration
  updateConnectorConfig: async (
    starshipId: string,
    connectorId: string,
    config: ConnectorInstanceConfig
  ): Promise<MCPServerConnector> => {
    console.log('[API] Updating connector configuration:', { starshipId, connectorId })

    try {
      const data = await api
        .put(`/api/starships/${starshipId}/connectors/${connectorId}/config`, { config })
        .then((res: AxiosResponse<{ connectorInstance: MCPServerConnector }>) => {
          console.log('[API] Successfully updated connector configuration')
          return res.data.connectorInstance
        })

      // Invalidate relevant caches
      invalidateConnectorInstanceCaches(starshipId)
      apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))

      return data
    } catch (error) {
      console.error('[API] Failed to update connector configuration:', error)
      throw error
    }
  },

  // Apply configuration template to connector instance
  applyConfigTemplate: async (
    starshipId: string,
    connectorId: string,
    templateId: string
  ): Promise<MCPServerConnector> => {
    console.log('[API] Applying configuration template:', { starshipId, connectorId, templateId })

    try {
      const data = await api
        .post(`/api/starships/${starshipId}/connectors/${connectorId}/config/template`, {
          templateId,
        })
        .then((res: AxiosResponse<{ connectorInstance: MCPServerConnector }>) => {
          console.log('[API] Successfully applied configuration template')
          return res.data.connectorInstance
        })

      // Invalidate relevant caches
      invalidateConnectorInstanceCaches(starshipId)
      apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))

      return data
    } catch (error) {
      console.error('[API] Failed to apply configuration template:', error)
      throw error
    }
  },

  // Get connector instance configuration
  getConnectorConfig: async (
    starshipId: string,
    connectorId: string
  ): Promise<{
    config: ConnectorInstanceConfig
    templateId?: string
    version: number
    lastModified: string
  }> => {
    console.log('[API] Getting connector configuration:', { starshipId, connectorId })

    try {
      const data = await api
        .get(`/api/starships/${starshipId}/connectors/${connectorId}/config`)
        .then(
          (
            res: AxiosResponse<{
              config: ConnectorInstanceConfig
              templateId?: string
              version: number
              lastModified: string
            }>
          ) => {
            console.log('[API] Successfully retrieved connector configuration')
            return res.data
          }
        )

      return data
    } catch (error) {
      console.error('[API] Failed to get connector configuration:', error)
      throw error
    }
  },

  // NEW: Configuration History Methods
  // Get configuration history for a connector instance
  getConnectorConfigHistory: async (
    starshipId: string,
    connectorId: string,
    limit?: number
  ): Promise<ConnectorConfigHistory[]> => {
    console.log('[API] Getting connector configuration history:', {
      starshipId,
      connectorId,
      limit,
    })

    try {
      const params = new URLSearchParams()
      if (limit) params.append('limit', limit.toString())

      const data = await api
        .get(
          `/api/starships/${starshipId}/connectors/${connectorId}/config/history${params.toString() ? `?${params.toString()}` : ''}`
        )
        .then((res: AxiosResponse<{ history: ConnectorConfigHistory[] }>) => {
          console.log('[API] Successfully retrieved connector configuration history')
          return res.data.history
        })

      return data
    } catch (error) {
      console.error('[API] Failed to get connector configuration history:', error)
      throw error
    }
  },

  // Rollback connector configuration to a previous state
  rollbackConnectorConfig: async (
    starshipId: string,
    connectorId: string,
    historyId: string,
    changeReason?: string
  ): Promise<void> => {
    console.log('[API] Rolling back connector configuration:', {
      starshipId,
      connectorId,
      historyId,
    })

    try {
      await api.post(`/api/starships/${starshipId}/connectors/${connectorId}/config/rollback`, {
        historyId,
        changeReason,
      })
      console.log('[API] Successfully rolled back connector configuration')

      // Invalidate relevant caches
      invalidateConnectorInstanceCaches(starshipId)
      apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
    } catch (error) {
      console.error('[API] Failed to rollback connector configuration:', error)
      throw error
    }
  },
}

// NEW: Configuration Template API
export const configTemplateAPI = {
  // Get all configuration templates
  getAll: async (options?: {
    category?: string
    public?: boolean
  }): Promise<ConnectorConfigTemplate[]> => {
    console.log('[API] Getting configuration templates:', options)

    try {
      const params = new URLSearchParams()
      if (options?.category) params.append('category', options.category)
      if (options?.public) params.append('public', 'true')

      const data = await api
        .get(`/api/config-templates${params.toString() ? `?${params.toString()}` : ''}`)
        .then((res: AxiosResponse<{ templates: ConnectorConfigTemplate[] }>) => {
          console.log('[API] Successfully retrieved configuration templates')
          return res.data.templates
        })

      return data
    } catch (error) {
      console.error('[API] Failed to get configuration templates:', error)
      throw error
    }
  },

  // Create configuration template
  create: async (
    template: Omit<
      ConnectorConfigTemplate,
      'id' | 'usageCount' | 'createdAt' | 'updatedAt' | 'authorId'
    >
  ): Promise<ConnectorConfigTemplate> => {
    console.log('[API] Creating configuration template:', template.name)

    try {
      const data = await api
        .post('/api/config-templates', template)
        .then((res: AxiosResponse<{ template: ConnectorConfigTemplate }>) => {
          console.log('[API] Successfully created configuration template')
          return res.data.template
        })

      return data
    } catch (error) {
      console.error('[API] Failed to create configuration template:', error)
      throw error
    }
  },

  // Get configuration template by ID
  getById: async (id: string): Promise<ConnectorConfigTemplate> => {
    console.log('[API] Getting configuration template:', id)

    try {
      const data = await api
        .get(`/api/config-templates/${id}`)
        .then((res: AxiosResponse<{ template: ConnectorConfigTemplate }>) => {
          console.log('[API] Successfully retrieved configuration template')
          return res.data.template
        })

      return data
    } catch (error) {
      console.error('[API] Failed to get configuration template:', error)
      throw error
    }
  },

  // Update configuration template
  update: async (
    id: string,
    updates: Partial<Omit<ConnectorConfigTemplate, 'id' | 'createdAt' | 'updatedAt' | 'authorId'>>
  ): Promise<ConnectorConfigTemplate> => {
    console.log('[API] Updating configuration template:', id)

    try {
      const data = await api
        .put(`/api/config-templates/${id}`, updates)
        .then((res: AxiosResponse<{ template: ConnectorConfigTemplate }>) => {
          console.log('[API] Successfully updated configuration template')
          return res.data.template
        })

      return data
    } catch (error) {
      console.error('[API] Failed to update configuration template:', error)
      throw error
    }
  },

  // Delete configuration template
  delete: async (id: string): Promise<void> => {
    console.log('[API] Deleting configuration template:', id)

    try {
      await api.delete(`/api/config-templates/${id}`)
      console.log('[API] Successfully deleted configuration template')
    } catch (error) {
      console.error('[API] Failed to delete configuration template:', error)
      throw error
    }
  },

  // Search configuration templates
  search: async (query: string, category?: string): Promise<ConnectorConfigTemplate[]> => {
    console.log('[API] Searching configuration templates:', { query, category })

    try {
      const params = new URLSearchParams({ q: query })
      if (category) params.append('category', category)

      const data = await api
        .get(`/api/config-templates/search?${params.toString()}`)
        .then((res: AxiosResponse<{ templates: ConnectorConfigTemplate[] }>) => {
          console.log('[API] Successfully searched configuration templates')
          return res.data.templates
        })

      return data
    } catch (error) {
      console.error('[API] Failed to search configuration templates:', error)
      throw error
    }
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

// Subscription API for managing Stripe subscription plans
export const subscriptionAPI = {
  // Get all available subscription plans (no caching - fetch fresh)
  getPlans: async (): Promise<SubscriptionPlan[]> => {
    console.log('[API] Fetching subscription plans from server')
    const data = await api
      .get('/api/subscriptions/plans')
      .then((res: AxiosResponse<SubscriptionPlan[]>) => {
        console.log('[API] Received subscription plans from server:', res.data.length)
        return res.data
      })

    return data
  },

  // Get a specific subscription plan by ID
  getPlan: async (planId: string): Promise<SubscriptionPlan> => {
    console.log('[API] Fetching subscription plan:', planId)
    const data = await api
      .get(`/api/subscriptions/plans/${planId}`)
      .then((res: AxiosResponse<SubscriptionPlan>) => {
        console.log('[API] Received subscription plan from server:', res.data.name)
        return res.data
      })

    return data
  },
}

// Utility function for generating client-side IDs
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export default api
