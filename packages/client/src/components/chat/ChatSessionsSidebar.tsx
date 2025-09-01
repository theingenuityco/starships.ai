'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { MessageSquare, Bot, Sparkles, Clock, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { chatAPI } from '@/lib/api'
import type { Session, SessionSourceType } from '@starships/protocol'

interface ChatSessionsSidebarProps {
  starshipId: string
  currentSessionId?: string | null
  onSessionSelect?: (sessionId: string | null) => void
  className?: string
}


export function ChatSessionsSidebar({ 
  starshipId, 
  currentSessionId, 
  onSessionSelect, 
  className = "" 
}: ChatSessionsSidebarProps) {
  const { isAuthenticated, userId } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch chat sessions for the starship
  useEffect(() => {
    if (!isAuthenticated || !starshipId) {
      setLoading(false)
      return
    }

    const fetchSessions = async () => {
      try {
        setLoading(true)
        setError(null)

        const data = await chatAPI.getSessionsByStarship(starshipId)
        setSessions(data.sessions || [])
      } catch (err) {
        console.error('Error fetching chat sessions:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch sessions')
      } finally {
        setLoading(false)
      }
    }

    fetchSessions()
  }, [isAuthenticated, starshipId])

  const formatSessionTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return date.toLocaleDateString()
  }

  const getSessionIcon = (source: SessionSourceType) => {
    switch (source) {
      case 'agent':
        return <Bot className="w-4 h-4" />
      default:
        return <MessageSquare className="w-4 h-4" />
    }
  }

  const getSessionTitle = (session: Session) => {
    if (session.source === 'agent') {
      return session.agent_id ? `Agent Chat` : 'Agent Session'
    }
    return 'Chat Session'
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className={`flex flex-col h-full bg-background border-r border-border ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Chat Sessions
        </h3>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-12 bg-muted/20 rounded-lg" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">No chat sessions yet</div>
            <div className="text-xs text-muted-foreground mt-1">
              Start a conversation to create your first session
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <motion.button
                key={session.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onSessionSelect?.(session.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors duration-200 hover:bg-muted/30 group ${
                  currentSessionId === session.id 
                    ? 'bg-muted/40 border border-border/50' 
                    : 'border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <div className={`mt-0.5 shrink-0 ${
                      session.source === 'agent' ? 'text-blue-500' : 'text-primary'
                    }`}>
                      {getSessionIcon(session.source)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {getSessionTitle(session)}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formatSessionTime(session.last_activity_at)}
                      </div>
                    </div>
                  </div>
                  {currentSessionId === session.id && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </div>
                
                {/* Session metadata */}
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="capitalize">
                    {session.source} mode
                  </div>
                  {session.total_tokens > 0 && (
                    <div>
                      {session.total_tokens.toLocaleString()} tokens
                    </div>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* New Session Button */}
      <div className="p-4 border-t border-border">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSessionSelect?.(null)}
          className="w-full p-3 text-sm font-medium text-foreground bg-muted/20 hover:bg-muted/30 rounded-lg transition-colors duration-200 border border-border/50"
        >
          + New Chat Session
        </motion.button>
      </div>
    </div>
  )
}