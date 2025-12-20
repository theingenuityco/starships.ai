'use client'

import Icon from '@/components/primitives/Icon'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ConversationModel } from '@starships/protocol'
import { formatDistanceToNow } from 'date-fns'

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
      active: { color: 'bg-green-100 text-green-800 border-green-200', icon: <Icon name="play" className="w-3 h-3" /> },
      paused: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <Icon name="pause" className="w-3 h-3" /> },
      completed: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: <Icon name="message-square" className="w-3 h-3" /> },
      archived: { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: <Icon name="archive" className="w-3 h-3" /> },
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
    return formatDistanceToNow(new Date(conversation.updatedAt || conversation.createdAt), { addSuffix: true })
  }

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="frosted-glass-card !border-0">
      <div className="flex items-center justify-between p-4">
        {/* Left side - Status and metadata */}
        <div className="flex items-center gap-4">
          {getStatusBadge()}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Icon name="clock" className="w-4 h-4" />
              <span>Updated {getLastActivityText()}</span>
            </div>
          </div>
        </div>

        {/* Right side - Action buttons */}
        <div className="flex items-center gap-2">
          {conversation.status === 'active' && (
            <Button variant="ghost" size="sm" onClick={() => onStatusChange?.('paused')} className="h-8 px-2 text-muted-foreground hover:text-foreground">
              <Icon name="pause" className="w-4 h-4" />
            </Button>
          )}

          {conversation.status === 'paused' && (
            <Button variant="ghost" size="sm" onClick={() => onStatusChange?.('active')} className="h-8 px-2 text-muted-foreground hover:text-foreground">
              <Icon name="play" className="w-4 h-4" />
            </Button>
          )}

          {conversation.status !== 'archived' && (
            <Button variant="ghost" size="sm" onClick={onArchive} className="h-8 px-2 text-muted-foreground hover:text-foreground">
              <Icon name="archive" className="w-4 h-4" />
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={onSettings} className="h-8 px-2 text-muted-foreground hover:text-foreground">
            <Icon name="settings" className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={onDelete} className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10">
            <Icon name="trash" className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
