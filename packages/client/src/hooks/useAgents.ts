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
        
        // TODO: Replace with actual API call
        // For now, return mock data
        const mockAgents: Agent[] = [
          {
            id: '1',
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
            id: '2',
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
      } catch (err) {
        console.error('Failed to load agents:', err)
        setError(err instanceof Error ? err.message : 'Failed to load agents')
      } finally {
        setLoading(false)
      }
    }

    loadAgents()
  }, [starshipId])

  return { agents, loading, error }
}