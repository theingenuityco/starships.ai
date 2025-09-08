'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { Copy, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

interface MessageSelectionProps {
  selectedMessages: string[]
  messages: MessageModel[]
  onSelectionChange: (messageIds: string[]) => void
  onBulkDelete?: (messageIds: string[]) => void
  onBulkCopy?: (messages: MessageModel[]) => void
}

export function MessageSelection({ selectedMessages, messages, onSelectionChange, onBulkDelete, onBulkCopy }: MessageSelectionProps) {
  const selectedCount = selectedMessages.length
  const isSelecting = selectedCount > 0

  const handleSelectAll = () => {
    if (selectedMessages.length === messages.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(messages.map(m => m.id))
    }
  }

  const handleClearSelection = () => {
    onSelectionChange([])
  }

  const handleBulkCopy = () => {
    if (!onBulkCopy) return
    const selectedMessageData = messages.filter(m => selectedMessages.includes(m.id))
    onBulkCopy(selectedMessageData)
  }

  const handleBulkDelete = () => {
    if (!onBulkDelete) return
    if (confirm(`Are you sure you want to delete ${selectedCount} message${selectedCount > 1 ? 's' : ''}?`)) {
      onBulkDelete(selectedMessages)
    }
  }

  return (
    <AnimatePresence>
      {isSelecting && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox checked={selectedMessages.length === messages.length} onCheckedChange={handleSelectAll} className="data-[state=checked]:bg-primary" />
              <span className="text-sm font-medium">
                {selectedCount} message{selectedCount > 1 ? 's' : ''} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onBulkCopy && (
                <Button variant="outline" size="sm" onClick={handleBulkCopy} className="h-8">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              )}

              {onBulkDelete && (
                <Button variant="outline" size="sm" onClick={handleBulkDelete} className="h-8 text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}

              <Button variant="ghost" size="sm" onClick={handleClearSelection} className="h-8">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface MessageCheckboxProps {
  messageId: string
  isSelected: boolean
  isSelecting: boolean
  onToggle: (messageId: string, selected: boolean) => void
  className?: string
}

export function MessageCheckbox({ messageId, isSelected, isSelecting, onToggle, className }: MessageCheckboxProps) {
  const handleToggle = (checked: boolean) => {
    onToggle(messageId, checked)
  }

  return (
    <AnimatePresence>
      {isSelecting && (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className={cn('flex items-center', className)}>
          <Checkbox checked={isSelected} onCheckedChange={handleToggle} className="data-[state=checked]:bg-primary" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
