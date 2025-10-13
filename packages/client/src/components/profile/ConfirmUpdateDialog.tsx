'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ChangeSummaryItem } from '@/hooks/useAccountForm'


type ConfirmUpdateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  changeList: ChangeSummaryItem[]
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmUpdateDialog({ open, onOpenChange, changeList, saving, onCancel, onConfirm }: ConfirmUpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Confirm changes</DialogTitle>
          <DialogDescription>You’re about to update sensitive account details. We will add OTP verification next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {changeList.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {changeList.map((c, i) => {
                if (c.type === 'displayName') {
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <Icon name="user" className="h-3.5 w-3.5 text-primary" />
                      <span>{`Display name: ${c.from} → ${c.to}`}</span>
                    </li>
                  )
                }
                if (c.type === 'email') {
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <Icon name="mail" className="h-3.5 w-3.5 text-primary" />
                      <span>{`Email: ${c.from} → ${c.to}`}</span>
                    </li>
                  )
                }
                return (
                  <li key={i} className="flex items-center gap-2">
                    <Icon name="lock" className="h-3.5 w-3.5 text-primary" />
                    <span>Password will be updated</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No changes detected.</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={saving}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
