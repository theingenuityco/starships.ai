'use client'

import Icon from '@/components/primitives/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useResetPassword } from '@/hooks/useAuth'
import { motion } from 'motion/react'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter'
import { validatePassword } from '@/utils/passwordStrength'

interface ResetPasswordFormProps {
  token: string
}

/**
 * Reset Password Form Component
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter()
  const resetPassword = useResetPassword({
    onSuccess: () => {
      // Hook already handles navigation to login page
    },
    onError: (error) => {
      if (error.message.includes('Invalid or expired')) {
        setIsValidToken(false)
        setError('This password reset link has expired or is invalid.')
      } else if (error.message.includes('do not match')) {
        setError('Passwords do not match.')
      } else {
        setError(error.message || 'Failed to reset password. Please try again.')
      }
    }
  })
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isValidToken, setIsValidToken] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields')
      return
    }

    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.isValid) {
      setError(passwordValidation.errors[0])
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    try {
      await resetPassword.mutateAsync({
        token,
        newPassword,
        confirmPassword
      })
    } catch (error) {
      // Error handling is done in the onError callback
    }
  }

  // Show error state for invalid token
  if (!isValidToken) {
    return (
      <motion.div 
        className="w-full max-w-md" 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Invalid Reset Link</CardTitle>
            <CardDescription>This password reset link has expired or is invalid</CardDescription>
          </CardHeader>
          
          <CardContent>
            <Alert className="mb-4 border-red-200 bg-red-50/50 backdrop-blur-sm">
              <Icon name="alert-circle" className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-900">{error}</AlertDescription>
            </Alert>

            <div className="space-y-4">
              <Button
                onClick={() => router.push('/forgot-password')}
                className="w-full"
              >
                <Icon name="mail" className="h-4 w-4 mr-2" />
                Request New Reset Link
              </Button>

              <div className="text-center">
                <Link 
                  href="/login" 
                  className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Icon name="arrow-left" className="h-4 w-4 mr-1 inline" />
                  Back to Sign In
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div 
      className="w-full max-w-md" 
      initial={{ opacity: 0, scale: 0.95 }} 
      animate={{ opacity: 1, scale: 1 }} 
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Create New Password</CardTitle>
          <CardDescription>Enter your new password to complete the reset</CardDescription>
        </CardHeader>
        
        <CardContent>
          {error && (
            <Alert className="mb-4 border-red-200 bg-red-50/50 backdrop-blur-sm">
              <Icon name="alert-circle" className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-900">{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={resetPassword.isPending}
                  className="w-full pr-10"
                  autoFocus
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={resetPassword.isPending}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} className="h-4 w-4" />
                </Button>
              </div>
              {newPassword && (
                <PasswordStrengthMeter password={newPassword} />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={resetPassword.isPending}
                  className="w-full pr-10"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={resetPassword.isPending}
                >
                  <Icon name={showConfirmPassword ? 'eye-off' : 'eye'} className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={resetPassword.isPending}
            >
              {resetPassword.isPending ? (
                <>
                  <Icon name="loader-2" className="h-4 w-4 mr-2 animate-spin" />
                  Resetting Password...
                </>
              ) : (
                <>
                  <Icon name="check" className="h-4 w-4 mr-2" />
                  Reset Password
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link 
              href="/login" 
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Icon name="arrow-left" className="h-4 w-4 mr-1 inline" />
              Back to Sign In
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}