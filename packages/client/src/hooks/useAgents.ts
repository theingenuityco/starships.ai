import { useState, useEffect } from 'react'
import type { Agent } from '@/lib/api'

interface UseAgentsReturn {
  agents: Agent[]
  loading: boolean
  error: string | null
}

export function useAgents(starshipId?: string): UseAgentsReturn {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadAgents = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Build API URL with optional starshipId parameter
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
        const url = starshipId
          ? `${apiUrl}/api/agents/starship/${encodeURIComponent(starshipId)}`
          : `${apiUrl}/api/agents`

        console.log('[AGENTS] Loading agents from:', url)
        
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          }
        })

        if (!response.ok) {
          // If agents endpoint doesn't exist yet, fall back to mock data
          if (response.status === 404) {
            console.log('[AGENTS] API endpoint not found, using mock data')
            const mockAgents: Agent[] = [
              {
                id: 'mock-research-assistant',
                name: 'Research Assistant',
                description: 'Helps with research and data analysis',
                model: 'gpt-4',
                systemPrompt: 'You are a research assistant specializing in data analysis and research.',
                starshipId: starshipId || 'default',
                tags: ['research', 'analysis'],
                category: 'analysis',
                authorId: 'system',
                isPublic: false,
                version: '1',
                usageCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              },
              {
                id: 'mock-code-assistant',
                name: 'Code Assistant',
                description: 'Helps with coding and development tasks',
                model: 'gpt-4',
                systemPrompt: 'You are a coding assistant specializing in software development.',
                starshipId: starshipId || 'default',
                tags: ['coding', 'development'],
                category: 'coding',
                authorId: 'system',
                isPublic: false,
                version: '1',
                usageCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ]
            setAgents(mockAgents)
            return
          }
          
          throw new Error(`Failed to load agents: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        const loadedAgents = Array.isArray(data) ? data : data.agents || []
        
        console.log('[AGENTS] Loaded agents:', loadedAgents.length)
        setAgents(loadedAgents)
      } catch (err) {
        console.error('Failed to load agents:', err)
        setError(err instanceof Error ? err.message : 'Failed to load agents')
        
        // Fallback to mock data on error
        console.log('[AGENTS] Using mock data due to error')
        const mockAgents: Agent[] = [
          {
            id: 'fallback-research-assistant',
            name: 'Research Assistant',
            description: 'Helps with research and data analysis',
            model: 'gpt-4',
            systemPrompt: 'You are a research assistant specializing in data analysis and research.',
            starshipId: starshipId || 'default',
            tags: ['research', 'analysis'],
            category: 'analysis',
            authorId: 'system',
            isPublic: false,
            version: '1',
            usageCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
        setAgents(mockAgents)
      } finally {
        setLoading(false)
      }
    }

    loadAgents()
  }, [starshipId])

  return { agents, loading, error }
}