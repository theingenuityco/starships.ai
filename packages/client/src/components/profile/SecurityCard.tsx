'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import type { FormState, PasswordErrors } from '@/hooks/useAccountForm'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'


type SecurityCardProps = {
  // Authentication state
  hasPassword: boolean
  authMethods: string[]
  isOAuthOnly: boolean
  
  // Password change functionality
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  form: Pick<FormState, 'currentPassword' | 'newPassword' | 'confirmNewPassword'>
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  passwordErrors: PasswordErrors
  saving: boolean
  cancelPasswordEdit: () => void
  currentPasswordRef?: React.RefObject<HTMLInputElement | null>
  
  // New OAuth functionality
  onSetPassword: () => void
}

export default function SecurityCard({ 
  hasPassword,
  authMethods,
  isOAuthOnly,
  showPassword, 
  setShowPassword, 
  form, 
  setForm, 
  passwordErrors, 
  saving, 
  cancelPasswordEdit, 
  currentPasswordRef,
  onSetPassword
}: SecurityCardProps) {
  const errorInput = 'border-destructive focus-visible:ring-destructive aria-[invalid=true]:border-destructive'

  return (
    <Card className="border-border/60 bg-background/70 backdrop-blur-sm transition-shadow hover:shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="shield" className="h-4 w-4 text-primary" />
          Account Security
        </CardTitle>
        <CardDescription>
          Manage your authentication methods and security settings.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* PASSWORD SECTION */}
        {hasPassword && (
          <div className="space-y-4">
            {!showPassword ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="lock" className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Password</p>
                    <p className="text-xs text-muted-foreground">
                      Change your password when necessary
                    </p>
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
          </div>
        )}

        {/* OAUTH-ONLY USERS: SET BACKUP PASSWORD */}
        {isOAuthOnly && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="lock" className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Password (Optional)</p>
                  <p className="text-xs text-muted-foreground">
                    Add password for backup access
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={onSetPassword}>
                <Icon name="plus" className="h-3 w-3 mr-1" />
                Set up password
              </Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )
}
