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
            // Minimal Agent fields (from protocol/mission.ts)
            id: 'fallback-research-assistant',
            name: 'Research Assistant',
            model: 'gpt-4o',
            category: 'analysis',
            description: 'Helps with research and data analysis'
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