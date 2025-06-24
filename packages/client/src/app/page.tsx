'use client'

import { useState, useEffect } from 'react'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { ThemeToggle } from '@/components/theme-toggle'
import { Agent } from '@/lib/api'
import { UI_TEXT } from '@/constants/text'

export default function HomePage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)

  return (
    <div className="flex h-screen">
      {/* Agent Selection Sidebar */}
      <div className="w-80 border-r border-border bg-card">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{UI_TEXT.APP_TITLE}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {UI_TEXT.APP_SUBTITLE}
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>
        <AgentSelector
          selectedAgent={selectedAgent}
          onAgentSelect={(agent) => {
            setSelectedAgent(agent)
            setChatSessionId(null) // Reset chat session when switching agents
          }}
        />
      </div>

      {/* Chat Interface */}
      <div className="flex-1 flex flex-col">
        {selectedAgent ? (
          <ChatInterface
            agent={selectedAgent}
            sessionId={chatSessionId}
            onSessionCreated={setChatSessionId}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2">{UI_TEXT.WELCOME_TITLE}</h2>
              <p className="text-muted-foreground">
                {UI_TEXT.WELCOME_MESSAGE}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 