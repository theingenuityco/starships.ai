'use client'

import { Square, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ConnectionStatus } from '@starships/protocol'

interface StreamingIndicatorProps {
  onStop: () => void
  connectionStatus?: ConnectionStatus
  isTyping?: boolean
  agentName?: string
}

export function StreamingIndicator({
  onStop,
  connectionStatus = 'connected',
  isTyping = false,
  agentName
}: StreamingIndicatorProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 rounded-md bg-zinc-800 border border-zinc-700"
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          connectionStatus === 'connected' ? 'bg-green-500' :
          connectionStatus === 'reconnecting' ? 'bg-yellow-500' :
          'bg-red-500'
        }`} />
        
        <span className="text-xs font-medium text-zinc-300">
          {agentName ? `${agentName} is responding...` : 'Streaming'}
        </span>
      </div>
      
      <Button
        size="sm"
        variant="ghost"
        onClick={onStop}
        className="h-6 w-6 p-0 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
      >
        <Square className="h-3 w-3" />
      </Button>
    </div>
  )
}