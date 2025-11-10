'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'

type EmailChangePendingProps = {
  newEmail: string
  expiresAt: string
  onResend: () => void
  onCancel: () => void
  loading?: boolean
}

export default function EmailChangePending({ newEmail, onResend, onCancel, loading = false }: EmailChangePendingProps) {
  return (
    <Card className="w-full border-amber-200 bg-amber-50/70 shadow-none dark:border-amber-700/70 dark:bg-amber-950/30">
      <CardHeader className="flex-row items-start gap-3 px-4 pb-2 pt-4 sm:items-center sm:pb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10">
          <Icon name="mail" className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </span>
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium">Email Change Pending</CardTitle>
          <CardDescription className="text-xs">
            Verification email sent to <span className="font-semibold text-foreground">{newEmail}</span>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onClick={onResend}
            disabled={loading}
            className="flex-1 justify-center border-amber-400/60 text-amber-600 hover:border-amber-500 hover:bg-amber-100/60 dark:border-amber-700/60 dark:text-amber-200 dark:hover:border-amber-500 dark:hover:bg-amber-900/40"
          >
            <Icon name="refresh" className="h-4 w-4" />
            Resend Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 justify-center border-border/50 text-foreground hover:bg-muted/30"
          >
            <Icon name="x" className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

