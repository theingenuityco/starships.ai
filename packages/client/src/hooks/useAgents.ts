import { useState, useEffect } from 'react'
import { agentAPI, type Agent } from '@/lib/api'

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
        
        console.log('[AGENTS] Loading agents', starshipId ? `for starship: ${starshipId}` : '(all agents)')
        
        // Use the proper agentAPI which handles authentication
        const loadedAgents = starshipId
          ? await agentAPI.getByStarshipId(starshipId)
          : await agentAPI.getAll()
        
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
            model: 'gpt-4o',
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