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

export default function EmailChangePending({
  newEmail,
  onResend,
  onCancel,
  loading = false,
}: EmailChangePendingProps) {
  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon name="mail" className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Email Change Pending
        </CardTitle>
        <CardDescription className="text-xs">
          Verification email sent to <strong>{newEmail}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onResend}
            disabled={loading}
            className="flex-1"
          >
            <Icon name="refresh" className="h-4 w-4" />
            Resend Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            className="flex-1"
          >
            <Icon name="x" className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

