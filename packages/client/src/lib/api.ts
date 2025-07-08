import axios, { AxiosResponse } from 'axios'

import { getApiBaseUrl } from './env'

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
    if (error.response?.status === 401) {
      console.error('[API] Authentication failed:', error.response.data)
      // TODO: Trigger logout or token refresh
    }
    return Promise.reject(error)
  }
)

// Import Agent and related types from protocol package
import { Agent, AgentConfig, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol'

// Re-export Agent for use in other client components
export type { Agent, AgentConfig, CreateAgentRequest, UpdateAgentRequest }

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

// API functions
export const agentAPI = {
  getAll: (): Promise<Agent[]> =>
    api.get('/api/agents').then((res: AxiosResponse<Agent[]>) => res.data),

  getById: (id: string): Promise<Agent> =>
    api.get(`/api/agents/${id}`).then((res: AxiosResponse<Agent>) => res.data),

  // ADD: Missing CRUD methods (server endpoints already exist)
  create: (
    agent: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<Agent> => api.post('/api/agents', agent).then((res: AxiosResponse<Agent>) => res.data),

  update: (id: string, updates: Partial<AgentConfig>): Promise<Agent> =>
    api.put(`/api/agents/${id}`, updates).then((res: AxiosResponse<Agent>) => res.data),

  delete: (id: string): Promise<void> => api.delete(`/api/agents/${id}`).then(() => {}),

  // ADD: Enhanced query methods
  getByCategory: (category: Agent['category']): Promise<Agent[]> =>
    api.get(`/api/agents?category=${category}`).then((res: AxiosResponse<Agent[]>) => res.data),

  getByAuthor: (authorId: string): Promise<Agent[]> =>
    api.get(`/api/agents?authorId=${authorId}`).then((res: AxiosResponse<Agent[]>) => res.data),

  getPublic: (limit?: number, offset?: number): Promise<Agent[]> =>
    api
      .get(`/api/agents/public?limit=${limit || 50}&offset=${offset || 0}`)
      .then((res: AxiosResponse<Agent[]>) => res.data),

  search: (query: string): Promise<Agent[]> =>
    api
      .get(`/api/agents/search?q=${encodeURIComponent(query)}`)
      .then((res: AxiosResponse<Agent[]>) => res.data),
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

  // Get starship details
  getStarship: (
    id: string
  ): Promise<{ starship: Starship; agents: Agent[]; availableSlots: number }> =>
    api.get(`/api/starships/${id}`).then(res => res.data),

  // Deploy agent to starship
  deployAgent: (starshipId: string, agentId: string): Promise<{ message: string }> =>
    api.post(`/api/starships/${starshipId}/agents/${agentId}/deploy`).then(res => res.data),

  // Remove agent from starship
  removeAgent: (starshipId: string, agentId: string): Promise<{ message: string }> =>
    api.delete(`/api/starships/${starshipId}/agents/${agentId}`).then(res => res.data),

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
