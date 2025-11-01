import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

interface AgentCreatedModalProps {
  open: boolean
  names: string[]
  onOpenChange: (open: boolean) => void
}

export function AgentCreatedModal({ open, names, onOpenChange }: AgentCreatedModalProps) {
  const uniqueNames = Array.isArray(names) ? Array.from(new Set(names.filter(n => typeof n === 'string' && n.trim()))).slice(0, 10) : []
  const title = uniqueNames.length > 1 ? 'Agents created' : 'Agent created'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {uniqueNames.length === 0 ? null : (
              <div className="space-y-1 pt-1">
                {uniqueNames.map(name => (
                  <div key={name} className="text-foreground">{name} Agent created.</div>
                ))}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            onClick={() => onOpenChange(false)}
          >
            OK
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


