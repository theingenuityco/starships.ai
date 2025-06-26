import axios, { AxiosResponse } from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

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
  async (config) => {
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
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for auth error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('[API] Authentication failed:', error.response.data)
      // TODO: Trigger logout or token refresh
    }
    return Promise.reject(error)
  }
)

// Types matching backend protocol (AgentConfig from @starships/protocol)
export interface Agent {
  id: string
  name: string
  model: string
  systemPrompt?: string
  description?: string
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
    stream: false
  }
}

// API functions
export const agentAPI = {
  getAll: (): Promise<Agent[]> => 
    api.get('/v1/agents').then((res: AxiosResponse<Agent[]>) => res.data),
  
  getById: (id: string): Promise<Agent> =>
    api.get(`/v1/agents/${id}`).then((res: AxiosResponse<Agent>) => res.data),
}

export const chatAPI = {
  // Send message directly to /v1/chat endpoint
  sendMessage: async (request: ChatRequest): Promise<Message> => {
    const backendRequest = toBackendRequest(request)
    const response = await api.post('/v1/chat', backendRequest)
    const backendResponse = response.data as ChatBackendResponse
    
    // Convert backend response to client Message format
    return {
      id: generateId(),
      content: backendResponse.reply,
      role: 'assistant',
      timestamp: new Date().toISOString(),
      sessionId: request.sessionId || `agent-${request.agentId}`
    }
  },

  // Clear memory for a session
  clearMemory: (sessionId: string): Promise<{ message: string }> =>
    api.delete(`/v1/chat/${sessionId}/memory`).then((res: AxiosResponse<{ message: string }>) => res.data),
}

export const userAPI = {
  // Sync Kinde user to backend database
  syncUser: async (userData: {
    kindeId: string
    email: string
    name?: string
    avatar?: string
  }): Promise<SyncedUser> => {
    const response = await api.post('/v1/users/sync', userData)
    return response.data as SyncedUser
  },

  // Get user by ID
  getById: (id: string): Promise<SyncedUser> =>
    api.get(`/v1/users/${id}`).then((res: AxiosResponse<SyncedUser>) => res.data),

  // Get user by Kinde ID
  getByKindeId: (kindeId: string): Promise<SyncedUser> =>
    api.get(`/v1/users/kinde/${kindeId}`).then((res: AxiosResponse<SyncedUser>) => res.data),
}

// Utility function for generating client-side IDs
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export default api 