'use client'

import { EnvironmentSummary } from '@starships/protocol'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertTriangle, Key, Trash2 } from 'lucide-react'

interface EnvironmentVariableDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  environmentVariable?: EnvironmentSummary
  loading?: boolean
}

export function EnvironmentVariableDeleteModal({ isOpen, onClose, onConfirm, environmentVariable, loading = false }: EnvironmentVariableDeleteModalProps) {
  if (!environmentVariable) {
    return null
  }

  const handleConfirm = () => {
    onConfirm()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Environment Variable
          </DialogTitle>
          <DialogDescription className="text-left">This action cannot be undone. The environment variable will be permanently deleted and removed from all agents using it.</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="p-4 bg-muted/50 rounded-lg border border-muted">
            <div className="flex items-center gap-2 mb-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono font-medium text-sm">{environmentVariable.key}</span>
            </div>
            {environmentVariable.description && <p className="text-sm text-muted-foreground">{environmentVariable.description}</p>}
          </div>

          <div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive mb-1">Warning</p>
                <p className="text-destructive/80">Any agents or workflows currently using this environment variable may stop functioning correctly after deletion.</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={loading} className="flex items-center gap-2">
            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <Trash2 className="h-4 w-4" />}
            {loading ? 'Deleting...' : 'Delete Variable'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
