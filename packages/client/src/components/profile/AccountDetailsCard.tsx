'use client'

import React from 'react'
import type { FormState } from '@/hooks/useAccountForm'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, User as UserIcon } from 'lucide-react'

type AccountDetailsCardProps = {
  form: Pick<FormState, 'displayName' | 'email'>
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  saving: boolean
}

export default function AccountDetailsCard({ form, setForm, saving }: AccountDetailsCardProps) {
  return (
    <Card className="border-border/60 bg-background/70 backdrop-blur-sm transition-shadow hover:shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Account details</CardTitle>
        <CardDescription>Keep your personal information accurate.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <div className="relative">
            <Input id="displayName" placeholder="Your name" value={form.displayName} onChange={e => setForm(prev => ({ ...prev, displayName: e.target.value }))} disabled={saving} className="pr-9" />
            <UserIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Input id="email" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} disabled={saving} className="pr-9" />
            <Mail className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <p className="text-[11px] text-muted-foreground">Changing email will require confirmation (OTP to be added).</p>
        </div>
      </CardContent>
    </Card>
  )
}
