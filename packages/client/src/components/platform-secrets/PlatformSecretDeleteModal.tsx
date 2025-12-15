'use client'

import Icon from '@/components/primitives/Icon'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { PlatformSecretSummary } from '@starships/protocol'

interface PlatformSecretDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  secret?: PlatformSecretSummary
  loading?: boolean
}

export function PlatformSecretDeleteModal({ isOpen, onClose, onConfirm, secret, loading = false }: PlatformSecretDeleteModalProps) {
  if (!secret) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="alert-triangle" className="h-5 w-5 text-destructive" />
            Delete Platform Secret
          </DialogTitle>
          <DialogDescription className="text-left">This action cannot be undone. The secret will be permanently deleted.</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="p-4 bg-muted/50 rounded-lg border border-muted">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="key" className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono font-medium text-sm">{secret.key}</span>
            </div>
            {secret.description && <p className="text-sm text-muted-foreground">{secret.description}</p>}
          </div>

          <div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <div className="flex items-start gap-2">
              <Icon name="alert-triangle" className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive mb-1">Warning</p>
                <p className="text-destructive/80">Connectors relying on this secret may stop working until reconfigured.</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading} className="flex items-center gap-2">
            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <Icon name="trash" className="h-4 w-4" />}
            {loading ? 'Deleting...' : 'Delete Secret'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
