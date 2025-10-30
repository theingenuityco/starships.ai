'use client'

import Icon from '@/components/primitives/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForgotPassword } from '@/hooks/useAuth'
import { motion } from 'motion/react'
import { useState } from 'react'
import Link from 'next/link'

/**
 * Forgot Password Form Component
 */
export function ForgotPasswordForm() {
  const forgotPassword = useForgotPassword()
  
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!email) {
      setFormError('Please enter your email address')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Please enter a valid email address')
      return
    }

    try {
      await forgotPassword.mutateAsync({ email })
      setEmailSent(true)
    } catch (error: any) {
      setFormError(error.message || 'Failed to send reset email. Please try again.')
    }
  }

  if (emailSent) {
    return (
      <motion.div 
        className="w-full max-w-md" 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Check Your Email</CardTitle>
            <CardDescription>Password reset request processed</CardDescription>
          </CardHeader>
          
          <CardContent>
            <Alert className="mb-4 border-emerald-500/50 bg-emerald-900/20 backdrop-blur-sm shadow-sm rounded-lg text-center">
              <div className="w-full space-y-2">
                <div className="flex items-center justify-center space-x-2 flex-wrap">
                  <Icon name="check-circle" className="h-4 w-4 text-emerald-400" />
                  <span className="text-white font-semibold text-sm">Request processed</span>
                </div>
                <AlertDescription>
                  <p className="text-sm text-white font-medium mb-2">
                    We&apos;ll send reset instructions to <span className="font-semibold text-emerald-200">{email}</span> if an account exists.
                  </p>
                  <p className="text-sm text-gray-300">
                    The link expires in 1 hour.
                  </p>
                </AlertDescription>
              </div>
            </Alert>

            <div className="space-y-4">
              <Button
                onClick={() => {
                  setEmailSent(false)
                  setEmail('')
                }}
                variant="outline"
                className="w-full"
              >
                <Icon name="arrow-left" className="h-4 w-4 mr-2" />
                Send Another Reset Email
              </Button>

              <div className="text-center">
                <Link 
                  href="/login" 
                  className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                >
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
          <CardTitle>Reset Your Password</CardTitle>
          <CardDescription>Enter your email to receive password reset instructions</CardDescription>
        </CardHeader>
        
        <CardContent>
          {formError && (
            <Alert className="mb-4 border-amber-200 bg-amber-50/50 backdrop-blur-sm">
              <Icon name="alert-circle" className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900">{formError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={forgotPassword.isPending}
                className="w-full"
                autoFocus
                autoComplete="email"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={forgotPassword.isPending}
            >
              {forgotPassword.isPending ? (
                <>
                  <Icon name="loader-2" className="h-4 w-4 mr-2 animate-spin" />
                  Sending Reset Email...
                </>
              ) : (
                <>
                  <Icon name="mail" className="h-4 w-4 mr-2" />
                  Send Reset Email
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