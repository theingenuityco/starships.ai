'use client'

import Icon from '@/components/primitives/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/useAuth'
import { OAuthButtons } from '@/components/auth/OAuthButton'
import { motion } from 'motion/react'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { PasswordStrengthMeter, PasswordLabelWithTooltip } from '@/components/ui/password-strength-meter'
import { validatePassword } from '@/utils/passwordStrength'

/**
 * OAuth error handling helper
 */
function getOAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'invalid_state':
      return 'Security validation failed. Please try again.'
    case 'provider_error':
      return 'Authentication provider error. Please try again.'
    case 'validation_failed':
      return 'Account validation failed. Please contact support.'
    case 'callback_failed':
      return 'Authentication failed. Please try again.'
    default:
      return 'Login failed. Please try again.'
  }
}

/**
 * JWT-based login and registration form
 */
export function LoginForm({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const { login, register, oauthLogin, resendVerification, isLoading } = useAuth()
  const searchParams = useSearchParams()

  // OAuth initiation function - uses relative URL like regular auth
  const initiateOAuth = (provider: 'google' | 'github') => {
    window.location.href = `/api/v1/auth/${provider}`
  }

  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  })

  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    name: '',
    confirmPassword: '',
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [activeTab, setActiveTab] = useState('login')
  const [formError, setFormError] = useState<string | null>(null)
  const [emailVerificationStatus, setEmailVerificationStatus] = useState<{
    needsVerification: boolean
    email: string
    message: string
  } | null>(null)
  const [autoSwitchedToRegister, setAutoSwitchedToRegister] = useState(false)

  // Track if OAuth has been handled to prevent duplicate calls (use ref for immediate synchronous check)
  const oauthHandledRef = useRef(false)
  // Track if success messages have been shown to prevent duplicates
  const passwordResetToastShownRef = useRef(false)
  const emailVerificationToastShownRef = useRef(false)
  const emailChangeToastShownRef = useRef(false)

  // OAuth callback, verification error, and password reset success handling
  useEffect(() => {
    // Add safety check to prevent hydration issues
    if (typeof window === 'undefined' || !searchParams) {
      return
    }

    try {
      const authCode = searchParams.get('auth_code') // ✅ SECURE: authorization code instead of JWT token
      const oauthError = searchParams.get('oauth_error')
      const verification = searchParams.get('verification')
      const resetSuccess = searchParams.get('reset')
      const emailChange = searchParams.get('emailChange')
      const expectedEmail = searchParams.get('expectedEmail')
      // Handle password reset success message
      if (resetSuccess === 'success' && !passwordResetToastShownRef.current) {
        passwordResetToastShownRef.current = true
        toast.success('Password reset successful! You can now log in with your new password.')
      }

      if (emailChange === 'success' && expectedEmail && !emailChangeToastShownRef.current) {
        emailChangeToastShownRef.current = true
        toast.success(`Email verified. Please sign in as ${expectedEmail} to continue.`)
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          params.delete('expectedEmail')
          const query = params.toString()
          const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
          window.history.replaceState(null, '', newUrl)
        }
      }

      // Handle email verification success message
      if (verification === 'success' && !emailVerificationToastShownRef.current) {
        emailVerificationToastShownRef.current = true
        toast.success('Email verified successfully! You can now log in to your account.')
      }


      // Prevent duplicate handling (synchronous check with ref)
      if (oauthHandledRef.current) {
        return
      }

      if (authCode) {
        oauthHandledRef.current = true
        // ✅ SECURE: Exchange authorization code for JWT via POST request
        oauthLogin(authCode)
      } else if (oauthError) {
        setFormError(getOAuthErrorMessage(oauthError))
      } else if (verification === 'error') {
        setFormError('Email verification failed. The verification link may be invalid or expired. Please try requesting a new verification email.')
      }
    } catch (error) {
      // Silently handle URL parameter errors
    }
  }, [searchParams, oauthLogin])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setEmailVerificationStatus(null)
    setAutoSwitchedToRegister(false)

    if (!loginData.email || !loginData.password) {
      setFormError('Please fill in all fields')
      return
    }

    const result = await login(loginData.email, loginData.password)

    // Check if email verification required
    if (result.emailNotVerified) {
      setEmailVerificationStatus({
        needsVerification: true,
        email: loginData.email,
        message: result.message || 'Please verify your email address to continue.',
      })
      return
    }

    if (!result.success) {
      return
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setEmailVerificationStatus(null)
    setAutoSwitchedToRegister(false)

    if (!registerData.email || !registerData.password || !registerData.name) {
      setFormError('Please fill in all fields')
      return
    }

    if (registerData.password !== registerData.confirmPassword) {
      setFormError('Passwords do not match')
      return
    }

    const passwordValidation = validatePassword(registerData.password)
    if (!passwordValidation.isValid) {
      setFormError(passwordValidation.errors[0])
      return
    }

    const result = await register(registerData.email, registerData.password, registerData.name)

    // Check if email verification sent
    if (result.emailVerificationSent) {
      setEmailVerificationStatus({
        needsVerification: false,
        email: registerData.email,
        message: result.message || 'Please check your email to verify your account.',
      })
      // Clear form following established UX patterns
      setRegisterData({ email: '', password: '', name: '', confirmPassword: '' })
      return
    }

    // Handle "user already exists" case - enterprise standard approach
    if (result.message && result.message.includes('already exists')) {
      // Switch to login tab and pre-fill email
      setActiveTab('login')
      onTabChange?.('login') // Notify parent of tab change
      setLoginData(prev => ({ ...prev, email: registerData.email }))
      // Show as informational message, not error
      setFormError(null)
      setEmailVerificationStatus({
        needsVerification: false,
        email: registerData.email,
        message: result.message,
      })
      setRegisterData({ email: '', password: '', name: '', confirmPassword: '' })
      return
    }

    if (!result.success) {
      return
    }
  }

  // Resend verification handler following established patterns
  const handleResendVerification = async (email: string) => {
    await resendVerification(email)
  }

  return (
    <motion.div className="w-full max-w-md" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.4 }}>
      <Card>
        <CardContent className="pt-6">
          {/* OAuth buttons ABOVE existing tabs */}
          <OAuthButtons onGoogleClick={() => initiateOAuth('google')} onGitHubClick={() => initiateOAuth('github')} disabled={isLoading} />

          {emailVerificationStatus && (
            <Alert className="mb-3 border-emerald-500/50 bg-emerald-900/20 backdrop-blur-sm text-center">
              <div className="w-full space-y-2">
                <div className="flex items-center justify-center space-x-2 flex-wrap">
                  <Icon name="check-circle" className="h-4 w-4 text-emerald-400" />
                  <span className="text-white font-semibold text-sm">We&apos;ve sent a verification email to:</span>
                  <span className="font-semibold text-emerald-200 text-sm break-all">{emailVerificationStatus.email}</span>
                </div>
                <AlertDescription>
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResendVerification(emailVerificationStatus.email)}
                      disabled={isLoading}
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      <Icon name="mail" className="h-4 w-4 mr-2" />
                      {isLoading ? 'Sending...' : 'Resend Email'}
                    </Button>
                  </div>
                </AlertDescription>
              </div>
            </Alert>
          )}

          <Tabs
            value={activeTab}
            onValueChange={value => {
              setActiveTab(value)
              onTabChange?.(value) // Notify parent of tab change
              setAutoSwitchedToRegister(false) // Clear flag when user manually switches tabs
              setFormError(null) // Clear form errors when switching tabs
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={loginData.email}
                    onChange={e => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="captain@starships.ai"
                    disabled={isLoading}
                    required
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={loginData.password}
                      onChange={e => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Enter your password"
                      disabled={isLoading}
                      required
                      className="h-12"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                    >
                      {showPassword ? <Icon name="eye-off" className="h-4 w-4" /> : <Icon name="eye" className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full h-12" disabled={isLoading}>
                  {isLoading ? (
                    <>Signing in...</>
                  ) : (
                    <>
                      <Icon name="log-in" className="h-4 w-4 mr-2" />
                      Sign In
                    </>
                  )}
                </Button>

                <div className="text-center space-y-2">
                  <p className="text-xs text-muted-foreground/80">
                    By signing in, you agree to our{' '}
                    <a href="/terms" target="_blank" className="text-primary/90 hover:text-primary hover:underline underline-offset-2">
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="/privacy" target="_blank" className="text-primary/90 hover:text-primary hover:underline underline-offset-2">
                      Privacy Policy
                    </a>
                  </p>
                  <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-800 transition-colors">
                    Forgot your password?
                  </Link>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="register" className="space-y-2">
              <form onSubmit={handleRegister} className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="register-name">Full Name</Label>
                  <Input
                    id="register-name"
                    type="text"
                    value={registerData.name}
                    onChange={e => setRegisterData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Captain Starship"
                    disabled={isLoading}
                    required
                    className="h-12"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    value={registerData.email}
                    onChange={e => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="captain@starships.ai"
                    disabled={isLoading}
                    required
                    className="h-12"
                  />
                </div>

                <div className="space-y-1">
                  <PasswordLabelWithTooltip htmlFor="register-password" password={registerData.password} />
                  <div className="relative">
                    <Input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      value={registerData.password}
                      onChange={e => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Create a strong password"
                      disabled={isLoading}
                      required
                      className="h-12"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                    >
                      {showPassword ? <Icon name="eye-off" className="h-4 w-4" /> : <Icon name="eye" className="h-4 w-4" />}
                    </Button>
                  </div>
                  {registerData.password && <PasswordStrengthMeter password={registerData.password} />}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="register-confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="register-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={registerData.confirmPassword}
                      onChange={e => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Confirm your password"
                      disabled={isLoading}
                      required
                      className="h-12"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? <Icon name="eye-off" className="h-4 w-4" /> : <Icon name="eye" className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full h-12" disabled={isLoading}>
                  {isLoading ? (
                    <>Creating account...</>
                  ) : (
                    <>
                      <Icon name="user-plus" className="h-4 w-4 mr-2" />
                      Create Account
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground/80 text-center">
                  By signing up, you agree to our{' '}
                  <a href="/terms" target="_blank" className="text-primary/90 hover:text-primary hover:underline underline-offset-2">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="/privacy" target="_blank" className="text-primary/90 hover:text-primary hover:underline underline-offset-2">
                    Privacy Policy
                  </a>
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  )
}
