import axios, { AxiosResponse } from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Types
export interface Agent {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: string
  channelId: string
}

export interface ChatSession {
  id: string
  agentId: string
  userId: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export interface CreateMessageRequest {
  content: string
  channelId: string
}

export interface CreateChatRequest {
  agentId: string
  userId: string
}

// API functions
export const agentAPI = {
  getAll: (): Promise<Agent[]> => 
    api.get('/api/agents').then((res: AxiosResponse<Agent[]>) => res.data),
  
  getById: (id: string): Promise<Agent> =>
    api.get(`/api/agents/${id}`).then((res: AxiosResponse<Agent>) => res.data),
}

export const chatAPI = {
  createSession: (data: CreateChatRequest): Promise<ChatSession> =>
    api.post('/api/chat', data).then((res: AxiosResponse<ChatSession>) => res.data),
  
  sendMessage: (data: CreateMessageRequest): Promise<Message> =>
    api.post('/api/chat/message', data).then((res: AxiosResponse<Message>) => res.data),
  
  getMessages: (channelId: string): Promise<Message[]> =>
    api.get(`/api/chat/${channelId}/messages`).then((res: AxiosResponse<Message[]>) => res.data),
}

export default api 