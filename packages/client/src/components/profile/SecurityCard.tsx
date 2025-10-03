'use client'

import React from 'react'
import type { FormState, PasswordErrors } from '@/hooks/useAccountForm'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock } from 'lucide-react'

type SecurityCardProps = {
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  form: Pick<FormState, 'currentPassword' | 'newPassword' | 'confirmNewPassword'>
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  passwordErrors: PasswordErrors
  saving: boolean
  cancelPasswordEdit: () => void
  currentPasswordRef?: React.RefObject<HTMLInputElement | null>
}

export default function SecurityCard({ showPassword, setShowPassword, form, setForm, passwordErrors, saving, cancelPasswordEdit, currentPasswordRef }: SecurityCardProps) {
  const errorInput = 'border-destructive focus-visible:ring-destructive aria-[invalid=true]:border-destructive'

  return (
    <Card className="border-border/60 bg-background/70 backdrop-blur-sm transition-shadow hover:shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Security</CardTitle>
        <CardDescription>Change your password when necessary.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showPassword ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Lock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">For your safety you’ll confirm changes.</p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => setShowPassword(true)} disabled={saving}>
              Change password
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Current password */}
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  ref={currentPasswordRef}
                  type="password"
                  placeholder="Current password"
                  value={form.currentPassword}
                  onChange={e => setForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                  disabled={saving}
                  autoComplete="current-password"
                  aria-invalid={!!passwordErrors.current}
                  className={passwordErrors.current ? errorInput : ''}
                />
                {passwordErrors.current && <p className="text-xs text-destructive">{passwordErrors.current}</p>}
              </div>

              {/* New password */}
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="New password"
                  value={form.newPassword}
                  onChange={e => setForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  disabled={saving}
                  autoComplete="new-password"
                  aria-invalid={!!passwordErrors.new}
                  className={passwordErrors.new ? errorInput : ''}
                />
                {passwordErrors.new && <p className="text-xs text-destructive">{passwordErrors.new}</p>}
              </div>

              {/* Confirm new password */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="confirmNewPassword">Re-enter new password</Label>
                <Input
                  id="confirmNewPassword"
                  type="password"
                  placeholder="Re-enter new password"
                  value={form.confirmNewPassword}
                  onChange={e => setForm(prev => ({ ...prev, confirmNewPassword: e.target.value }))}
                  disabled={saving}
                  autoComplete="new-password"
                  aria-invalid={!!passwordErrors.confirm}
                  className={passwordErrors.confirm ? errorInput : ''}
                />
                {passwordErrors.confirm && <p className="text-xs text-destructive">{passwordErrors.confirm}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" variant="default" disabled={saving}>
                {saving ? 'Saving…' : 'Save password'}
              </Button>
              <Button type="button" variant="ghost" onClick={cancelPasswordEdit} disabled={saving}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
