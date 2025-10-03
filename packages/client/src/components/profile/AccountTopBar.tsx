'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Shield, CheckCircle2 } from 'lucide-react'

type AccountTopBarProps = {
  dirty: boolean
  saving: boolean
  onReset: () => void
  formId?: string
}

export default function AccountTopBar({ dirty, saving, onReset, formId = 'account-form' }: AccountTopBarProps) {
  return (
    <div className="sticky top-0 z-10 rounded-2xl border border-border/60 bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 p-4 ring-1 ring-inset ring-border/40">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Account</h2>
          <p className="text-sm text-muted-foreground">Manage your profile and security.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {dirty ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Up to date
            </span>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={!dirty}>
            Reset
          </Button>
          <Button type="submit" form={formId} className="px-4" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
