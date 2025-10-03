'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type ConfirmDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  deleting: boolean
  onCancel: () => void
  onConfirmDelete: () => void
}

export default function ConfirmDeleteDialog({ open, onOpenChange, deleting, onCancel, onConfirmDelete }: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete account</DialogTitle>
          <DialogDescription>This action cannot be undone. We’ll add an OTP verification step later.</DialogDescription>
        </DialogHeader>
        <p className="text-sm">Are you sure you want to permanently delete your account and all associated data?</p>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirmDelete} disabled={deleting}>
            Delete account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
