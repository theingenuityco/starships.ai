'use client'

import { useState } from 'react'
import { Agent } from '@/lib/api'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { ChatInterface } from '@/components/session/ChatInterface'
import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { Users } from 'lucide-react'

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
    <JwtAuthGate>
      <div className="grid grid-cols-[350px_1fr] h-full">
        {/* Left sidebar - fixed width */}
        <div className="border-r bg-card shadow-sm overflow-hidden">
          <div className="p-6 h-full flex flex-col">
            <h2 className="text-xl font-semibold mb-6 flex items-center">
              <span className="bg-primary/10 p-2 rounded-md mr-3 shadow-sm">
                <Users className="h-5 w-5 text-primary" />
              </span>
              Crew Console
            </h2>
            <div className="flex-1 overflow-auto pr-1 -mr-1">
              <AgentSelector
                selectedAgent={selectedAgent}
                onAgentSelect={handleAgentSelect}
                showCreateButton={true}
                showFilters={true}
              />
            </div>
          </div>
        </div>
        
        {/* Right content area */}
        <div className="bg-background overflow-hidden">
          {selectedAgent ? (
            <ChatInterface
              agent={selectedAgent}
              sessionId={sessionId}
              onSessionCreated={handleSessionCreated}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-muted/5">
              <div className="bg-card p-8 rounded-lg text-center max-w-md shadow-sm border border-border/50">
                <div className="bg-primary/10 p-3 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                  <Users className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-xl font-medium mb-3">Select an agent to start chatting</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Choose a crew member from the sidebar to begin your conversation
                </p>
                <div className="flex justify-center">
                  <div className="bg-muted/20 rounded-md p-3 text-sm text-muted-foreground flex items-center">
                    <svg
                      className="w-5 h-5 mr-2 text-muted-foreground/70"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Agents can assist with various tasks based on their specialization
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </JwtAuthGate>
  )
}
