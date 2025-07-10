'use client'

import { useState } from 'react'
import { Agent } from '@/lib/api'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { ChatInterface } from '@/components/chat/ChatInterface'

export default function CrewPage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent)
    setSessionId(null) // Reset session when agent changes
  }

  const handleSessionCreated = (newSessionId: string) => {
    setSessionId(newSessionId)
  }

  return (
    <div className="flex h-full">
      <div className="w-80 border-r bg-card">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Crew Console</h2>
          <AgentSelector
            selectedAgent={selectedAgent}
            onAgentSelect={handleAgentSelect}
            showCreateButton={true}
            showFilters={true}
          />
        </div>
      </div>
      <div className="flex-1">
        {selectedAgent ? (
          <ChatInterface
            agent={selectedAgent}
            sessionId={sessionId}
            onSessionCreated={handleSessionCreated}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select an agent to start chatting</p>
          </div>
        )}
      </div>
    </div>
  )
}
