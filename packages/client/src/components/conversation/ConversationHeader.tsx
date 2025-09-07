'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ConversationModel } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'
import { Archive, Clock, MessageSquare, Pause, Play, Settings, Trash2, Zap } from 'lucide-react'
import { motion } from 'motion/react'

interface ConversationHeaderProps {
  conversation: ConversationModel
  onStatusChange?: (status: ConversationModel['status']) => void
  onArchive?: () => void
  onDelete?: () => void
  onSettings?: () => void
}

export function ConversationHeader({ conversation, onStatusChange, onArchive, onDelete, onSettings }: ConversationHeaderProps) {
  const getStatusBadge = () => {
    const statusConfig = {
      active: { color: 'bg-green-100 text-green-800 border-green-200', icon: <Play className="w-3 h-3" /> },
      paused: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <Pause className="w-3 h-3" /> },
      completed: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: <MessageSquare className="w-3 h-3" /> },
      archived: { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: <Archive className="w-3 h-3" /> },
    }

    const config = statusConfig[conversation.status]

    return (
      <Badge variant="outline" className={config.color}>
        {config.icon}
        <span className="ml-1 capitalize">{conversation.status}</span>
      </Badge>
    )
  }

  const getLastActivityText = () => {
    return formatDistanceToNow(new Date(conversation.lastActivityAt), { addSuffix: true })
  }

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center justify-between p-4">
        {/* Left side - Status and metadata */}
        <div className="flex items-center gap-4">
          {getStatusBadge()}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />
              <span>{conversation.messageCount} messages</span>
            </div>

            <div className="flex items-center gap-1">
              <Zap className="w-4 h-4" />
              <span>{conversation.totalTokens.toLocaleString()} tokens</span>
            </div>

            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Active {getLastActivityText()}</span>
            </div>
          </div>
        </div>

        {/* Right side - Action buttons */}
        <div className="flex items-center gap-2">
          {conversation.status === 'active' && (
            <Button variant="ghost" size="sm" onClick={() => onStatusChange?.('paused')} className="h-8 px-2 text-muted-foreground hover:text-foreground">
              <Pause className="w-4 h-4" />
            </Button>
          )}

          {conversation.status === 'paused' && (
            <Button variant="ghost" size="sm" onClick={() => onStatusChange?.('active')} className="h-8 px-2 text-muted-foreground hover:text-foreground">
              <Play className="w-4 h-4" />
            </Button>
          )}

          {conversation.status !== 'archived' && (
            <Button variant="ghost" size="sm" onClick={onArchive} className="h-8 px-2 text-muted-foreground hover:text-foreground">
              <Archive className="w-4 h-4" />
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={onSettings} className="h-8 px-2 text-muted-foreground hover:text-foreground">
            <Settings className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={onDelete} className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
