import { useState, useEffect } from 'react'
import { agentAPI } from '@/lib/api'
import type { AgentModel } from '@starships/protocol'

interface UseAgentsReturn {
  agents: AgentModel[]
  loading: boolean
  error: string | null
}

export function useAgents(starshipId?: string): UseAgentsReturn {
  const [agents, setAgents] = useState<AgentModel[]>([])
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
        
        // Return empty array on error instead of mock data
        console.log('[AGENTS] Using empty array due to error')
        setAgents([])
      } finally {
        setLoading(false)
      }
    }

    loadAgents()
  }, [starshipId])

  return { agents, loading, error }
}