'use client'

import { useState, useEffect } from 'react'
import { Agent, agentAPI } from '@/lib/api'
import { AgentCard } from './AgentCard'
import { Loader2 } from 'lucide-react'
import { AGENT_TEXT, ERROR_TEXT, LOADING_TEXT } from '@/constants/text'

interface AgentSelectorProps {
  selectedAgent: Agent | null
  onAgentSelect: (agent: Agent) => void
}

export function AgentSelector({ selectedAgent, onAgentSelect }: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoading(true)
        const fetchedAgents = await agentAPI.getAll()
        setAgents(fetchedAgents)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch agents:', err)
        setError(ERROR_TEXT.FAILED_TO_LOAD_AGENTS)
      } finally {
        setLoading(false)
      }
    }

    fetchAgents()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">{LOADING_TEXT.AGENTS}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-destructive"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5l-6.928-12c-.77-.833-2.694-.833-3.464 0l-6.928 12c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">{AGENT_TEXT.NO_AGENTS_AVAILABLE}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold px-2">{AGENT_TEXT.SECTION_TITLE}</h2>
      <div className="space-y-2">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isSelected={selectedAgent?.id === agent.id}
            onClick={() => onAgentSelect(agent)}
          />
        ))}
      </div>
    </div>
  )
} 