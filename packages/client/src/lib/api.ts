import axios, { AxiosResponse } from 'axios'

import { getApiBaseUrl } from './env'
import { apiCache, CACHE_KEYS, invalidateAgentCaches } from './cache'

const API_BASE_URL = getApiBaseUrl()

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Token provider function for dynamic token retrieval
let getTokenFunction: (() => Promise<string | null>) | null = null

export const setTokenProvider = (tokenProvider: () => Promise<string | null>) => {
  getTokenFunction = tokenProvider
  console.log('[API] Token provider set')
}

// Request interceptor to add authentication token
api.interceptors.request.use(
  async config => {
    console.log('[API] Request interceptor running for:', config.url)
    if (getTokenFunction) {
      const token = await getTokenFunction()
      console.log('[API] Token from provider:', token ? 'Token present' : 'No token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        console.log('[API] Authorization header added')
      } else {
        console.log('[API] No token available, skipping Authorization header')
      }
    } else {
      console.log('[API] No token provider configured')
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// Response interceptor for auth error handling
api.interceptors.response.use(
  response => response,
  error => {
    console.error('[API] Request failed:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers,
    })

    if (error.response?.status === 401) {
      console.error(
        '[API] Authentication failed - token may be invalid or expired:',
        error.response.data
      )
      // TODO: Trigger logout or token refresh
    } else if (error.response?.status === 500) {
      console.error('[API] Server error occurred:', error.response.data)
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

// Re-export Agent for use in other client components
export type { Agent, AgentConfig, CreateAgentRequest, UpdateAgentRequest, AgentTemplate }

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
  name: string
  class: 'scout' | 'cruiser'
  powerLevel: number
  ownerId: string
  status: 'active' | 'docked' | 'maintenance'
  maxAgents: number
  activeExpeditions: number
  sibilInsights: number
  createdAt: string
  updatedAt: string
}

export interface Codex {
  id: string
  starshipId: string
  version: string
  timestamp: string
  author: string
  changeSummary: string
  isActive: boolean
}

export interface Vision {
  id: string
  codexId: string
  statement: string
  confidence: number
  lastRefined: string
  refinementCount: number
  updatedAt: string
}

export interface CodexProjection {
  vision?: string
  goals?: Array<{
    id: string
    description: string
    type: 'short_term' | 'long_term' | 'milestone'
    status: string
  }>
  constraints?: Array<{
    id: string
    description: string
    type: 'resource' | 'ethical' | 'technical' | 'business'
    isActive: boolean
  }>
  concepts?: Array<{
    id: string
    description: string
    category: string
  }>
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

  createAgentFromTemplate: async (templateId: string, agentName: string): Promise<Agent> => {
    try {
      const data = await api
        .post(`/api/agent-templates/${templateId}/create-agent`, { agentName })
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

// NEW: Starship API
export const starshipAPI = {
  // Get user's starships
  getUserStarships: (): Promise<{ starships: Starship[] }> =>
    api.get('/api/starships').then(res => res.data),

  // Create new starship
  createStarship: (data: {
    name: string
    class: 'scout' | 'cruiser'
  }): Promise<{ starship: Starship; codex: Codex }> =>
    api.post('/api/starships', data).then(res => res.data),

  // Get starship details with caching
  getStarship: async (
    id: string
  ): Promise<{ starship: Starship; agents: Agent[]; availableSlots: number }> => {
    const cacheKey = CACHE_KEYS.STARSHIP_BY_ID(id)
    const cached = apiCache.get<{ starship: Starship; agents: Agent[]; availableSlots: number }>(
      cacheKey
    )
    if (cached) {
      return cached
    }

    const data = await api.get(`/api/starships/${id}`).then(res => res.data)
    apiCache.set(cacheKey, data, 2 * 60 * 1000) // Cache for 2 minutes since starship data changes frequently
    return data
  },

  // Deploy agent to starship with cache invalidation
  deployAgent: async (starshipId: string, agentId: string): Promise<{ message: string }> => {
    const data = await api
      .post(`/api/starships/${starshipId}/agents/${agentId}/deploy`)
      .then(res => res.data)
    // Invalidate starship cache since agent deployment changes starship state
    apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
    return data
  },

  // Remove agent from starship with cache invalidation
  removeAgent: async (starshipId: string, agentId: string): Promise<{ message: string }> => {
    const data = await api
      .delete(`/api/starships/${starshipId}/agents/${agentId}`)
      .then(res => res.data)
    // Invalidate starship cache since agent removal changes starship state
    apiCache.invalidate(CACHE_KEYS.STARSHIP_BY_ID(starshipId))
    return data
  },

  // Get active codex for starship
  getCodex: (starshipId: string): Promise<{ codex: any }> =>
    api.get(`/api/starships/${starshipId}/codex`).then(res => res.data),

  // Update codex with mutations
  updateCodex: (
    starshipId: string,
    mutations: {
      vision?: { statement: string }
      goals?: Array<{ description: string; type: 'short_term' | 'long_term' | 'milestone' }>
      constraints?: Array<{
        description: string
        type: 'resource' | 'ethical' | 'technical' | 'business'
      }>
    }
  ): Promise<{ codex: Codex }> =>
    api.post(`/api/starships/${starshipId}/codex/mutate`, { mutations }).then(res => res.data),

  // Get projection for specific lens
  getProjection: (
    starshipId: string,
    lens: 'telos' | 'ethos' | 'full'
  ): Promise<{ projection: CodexProjection }> =>
    api.get(`/api/starships/${starshipId}/projection/${lens}`).then(res => res.data),
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
