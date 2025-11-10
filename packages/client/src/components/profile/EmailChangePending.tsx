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
    <Card className="w-full rounded-xl border border-amber-400/50 bg-amber-950/40 shadow-sm dark:border-amber-700/60">
      <CardHeader className="flex-row items-start gap-3 px-5 pb-2 pt-5 sm:items-center sm:pb-3">
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
      <CardContent className="px-5 pb-5 pt-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onResend}
            disabled={loading}
            className="w-full justify-center border-amber-400/70 px-5 text-amber-200 hover:border-amber-300 hover:bg-amber-400/15 dark:border-amber-700/60 sm:w-auto"
          >
            <Icon name="refresh" className="h-4 w-4" />
            Resend Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            className="w-full justify-center border-border/70 px-5 text-foreground hover:bg-muted/30 sm:w-auto"
          >
            <Icon name="x" className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

