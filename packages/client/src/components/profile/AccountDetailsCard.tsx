'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import type { FormState } from '@/hooks/useAccountForm'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import EmailChangePending from './EmailChangePending'

type AccountDetailsCardProps = {
  form: Pick<FormState, 'displayName' | 'email'>
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  saving: boolean
  pendingEmailChange?: {
    newEmail: string
    expiresAt: string
  } | null
  onResendEmail?: () => void
  onCancelEmailChange?: () => void
}

export default function AccountDetailsCard({
  form,
  setForm,
  saving,
  pendingEmailChange,
  onResendEmail,
  onCancelEmailChange,
}: AccountDetailsCardProps) {
  return (
    <Card className="flex h-full flex-col border-border/60 bg-background/70 backdrop-blur-sm transition-shadow hover:shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="id-card" className="h-4 w-4 text-primary" />
          Account details
        </CardTitle>
        <CardDescription className="text-sm">Keep your personal information accurate.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <div className="relative">
              <Input
                id="displayName"
                placeholder="Your name"
                value={form.displayName}
                onChange={e => setForm(prev => ({ ...prev, displayName: e.target.value }))}
                disabled={saving}
                className="pr-9"
              />
              <Icon name="user" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={pendingEmailChange ? pendingEmailChange.newEmail : form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                disabled={saving || !!pendingEmailChange}
                className="pr-9"
              />
              <Icon name="mail" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            {!pendingEmailChange && (
              <p className="text-[11px] text-muted-foreground">Changing email will send a verification email to the new address.</p>
            )}
          </div>
        </div>

        {pendingEmailChange && (
          <EmailChangePending
            newEmail={pendingEmailChange.newEmail}
            expiresAt={pendingEmailChange.expiresAt}
            onResend={onResendEmail || (() => {})}
            onCancel={onCancelEmailChange || (() => {})}
            loading={saving}
          />
        )}
      </CardContent>
    </Card>
  )
}
