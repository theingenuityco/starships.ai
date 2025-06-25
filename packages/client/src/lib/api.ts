import axios, { AxiosResponse } from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// TODO: Implement specific error types and better error handling
// TODO: Add request/response interceptors for logging and error handling
// TODO: Add retry logic for failed requests

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

// Backend request/response types (snake_case)
interface ChatBackendRequest {
  agent_id: string
  user_id: string
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

// Client-friendly request type (camelCase)
export interface ChatRequest {
  agentId: string
  userId: string
  sessionId?: string
  message: string
}

// Utility to convert camelCase to snake_case for backend
function toBackendRequest(req: ChatRequest): ChatBackendRequest {
  return {
    agent_id: req.agentId,
    user_id: req.userId,
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
      sessionId: request.sessionId || `${request.agentId}:${request.userId}`
    }
  },

  // Clear memory for a session
  clearMemory: (sessionId: string): Promise<{ message: string }> =>
    api.delete(`/v1/chat/${sessionId}/memory`).then((res: AxiosResponse<{ message: string }>) => res.data),
}

// Utility function for generating client-side IDs
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export default api 