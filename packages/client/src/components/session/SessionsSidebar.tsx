'use client'

import { useAuth } from '@/hooks/useAuth'
import { useStarshipSessions } from '@/hooks/useSessions'
import type { SessionModel } from '@starships/protocol'
import { ChevronRight, Clock, MessageSquare } from 'lucide-react'
import { motion } from 'motion/react'

interface SessionsSidebarProps {
  starshipId: string
  currentSessionId?: string | null
  onSessionSelect?: (sessionId: string | null) => void
  className?: string
}

export function SessionsSidebar({
  starshipId,
  currentSessionId,
  onSessionSelect,
  className = '',
}: SessionsSidebarProps) {
  const { isAuthenticated } = useAuth()

  // Use TanStack Query to fetch sessions
  const {
    data: sessionData,
    isLoading: loading,
    error: queryError,
  } = useStarshipSessions(starshipId, !!isAuthenticated)

  const sessions = sessionData?.sessions || []
  const error = queryError ? 'Failed to fetch sessions' : null

  const formatSessionTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return date.toLocaleDateString()
  }

  const getSessionIcon = () => {
    return <MessageSquare className="w-4 h-4" />
  }

  const getSessionTitle = (session: SessionModel) => {
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
            {sessions.map((session: SessionModel) => (
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
                    <div className="mt-0.5 shrink-0 text-primary">{getSessionIcon()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {getSessionTitle(session)}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formatSessionTime(session.lastActivityAt)}
                      </div>
                    </div>
                  </div>
                  {currentSessionId === session.id && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </div>

                {/* Session metadata */}
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <div>Messages: {session.messageCount}</div>
                  {session.totalTokens && session.totalTokens > 0 && (
                    <div>{session.totalTokens.toLocaleString()} tokens</div>
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
