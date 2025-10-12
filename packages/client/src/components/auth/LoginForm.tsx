'use client'

import Icon from '@/components/primitives/Icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WaitlistMessage } from '@/components/auth/WaitlistMessage'
import { useAuth } from '@/hooks/useAuth'
import { OAuthButtons } from '@/components/auth/OAuthButton'
import { motion } from 'motion/react'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

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
export function LoginForm() {
  const { login, register, oauthLogin, resendVerification, isLoading, error } = useAuth()
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
  const [waitlistStatus, setWaitlistStatus] = useState<{
    isWaitlisted: boolean
    message: string
  } | null>(null)
  const [emailVerificationStatus, setEmailVerificationStatus] = useState<{
    needsVerification: boolean
    email: string
    message: string
  } | null>(null)
  const [autoSwitchedToRegister, setAutoSwitchedToRegister] = useState(false)

  // Track if OAuth has been handled to prevent duplicate calls (use ref for immediate synchronous check)
  const oauthHandledRef = useRef(false)

  // OAuth callback handling - SECURE authorization code exchange
  useEffect(() => {
    const authCode = searchParams?.get('auth_code') // ✅ SECURE: authorization code instead of JWT token
    const oauthError = searchParams?.get('oauth_error')
    const oauthWaitlist = searchParams?.get('oauth_waitlist')


    // Prevent duplicate handling (synchronous check with ref)
    if (oauthHandledRef.current) {
      console.log('[OAuth] Already handled, skipping')
      return
    }

    if (authCode) {
      oauthHandledRef.current = true
      console.log('[OAuth] Exchanging authorization code for JWT token (secure)')
      // ✅ SECURE: Exchange authorization code for JWT via POST request
      oauthLogin(authCode)
    } else if (oauthError) {
      setFormError(getOAuthErrorMessage(oauthError))
    } else if (oauthWaitlist) {
      setWaitlistStatus({
        isWaitlisted: true,
        message: 'Thanks for signing up! Please wait for approval to access the app.',
      })
    }
  }, [searchParams, oauthLogin])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setWaitlistStatus(null)
    setEmailVerificationStatus(null)
    setAutoSwitchedToRegister(false)

    if (!loginData.email || !loginData.password) {
      setFormError('Please fill in all fields')
      return
    }

    const result = await login(loginData.email, loginData.password)

    // Check if waitlisted response
    if (result.waitlisted) {
      setWaitlistStatus({
        isWaitlisted: true,
        message: result.message || 'You are on our waitlist. Stay tuned!',
      })
      return
    }

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
      const errorMessage = result.error || 'Login failed'
      
      // Check if user doesn't exist - offer to switch to registration
      if (errorMessage.includes('No account found') || errorMessage.includes('Please sign up first')) {
        setFormError(null) // Clear error since we're handling it gracefully
        // Pre-fill registration form with the email
        setRegisterData(prev => ({ ...prev, email: loginData.email }))
        // Automatically switch to registration tab
        setActiveTab('register')
        setAutoSwitchedToRegister(true)
        return
      }
      
      setFormError(errorMessage)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setWaitlistStatus(null)
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

    if (registerData.password.length < 8) {
      setFormError('Password must be at least 8 characters long')
      return
    }

    const result = await register(registerData.email, registerData.password, registerData.name)

    // Check if waitlisted response
    if (result.waitlisted) {
      setWaitlistStatus({
        isWaitlisted: true,
        message: result.message || 'You have been added to the waitlist!',
      })
      // Optionally clear form
      setRegisterData({ email: '', password: '', name: '', confirmPassword: '' })
      return
    }

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

    if (!result.success) {
      setFormError(result.error || 'Registration failed')
    }
  }

  // Resend verification handler following established patterns
  const handleResendVerification = async (email: string) => {
    await resendVerification(email)
  }

  return (
    <motion.div className="w-full max-w-md" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.4 }}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Access Your Starship</CardTitle>
          <CardDescription>Sign in to your starship or create a new account</CardDescription>
        </CardHeader>

        <CardContent>
          {/* OAuth buttons ABOVE existing tabs */}
          <OAuthButtons onGoogleClick={() => initiateOAuth('google')} onGitHubClick={() => initiateOAuth('github')} disabled={isLoading || !!waitlistStatus} />

          {waitlistStatus && (
            <div className="mb-4">
              <WaitlistMessage message={waitlistStatus.message} onClose={() => setWaitlistStatus(null)} />
            </div>
          )}

          {emailVerificationStatus && (
            <Alert className="mb-4 border-emerald-200 bg-emerald-50">
              <Icon name="check-circle" className="h-4 w-4" />
              <div className="space-y-3">
                <AlertTitle className="text-emerald-900 font-medium">
                  {emailVerificationStatus.needsVerification ? 'Email Verification Required' : 'Registration successful! We\'ve sent a verification email to:'}
                </AlertTitle>
                <AlertDescription>
                  <div className="bg-white border border-emerald-200 rounded-md px-4 py-3 mb-4">
                    <p className="font-medium text-gray-900 text-center">
                      {emailVerificationStatus.email}
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResendVerification(emailVerificationStatus.email)}
                      disabled={isLoading}
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                    >
                      <Icon name="mail" className="h-4 w-4 mr-2" />
                      {isLoading ? 'Sending...' : 'Resend Email'}
                    </Button>
                  </div>
                </AlertDescription>
              </div>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={(value) => {
            setActiveTab(value)
            setAutoSwitchedToRegister(false) // Clear flag when user manually switches tabs
          }}>
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

                {(formError || error) && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError || error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>Signing in...</>
                  ) : (
                    <>
                      <Icon name="log-in" className="h-4 w-4 mr-2" />
                      Sign In
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="space-y-4">
              {autoSwitchedToRegister && (
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertDescription className="text-blue-800">
                    No account found with that email address. Please create a new account below.
                  </AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-name">Full Name</Label>
                  <Input
                    id="register-name"
                    type="text"
                    value={registerData.name}
                    onChange={e => setRegisterData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Captain Starship"
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    value={registerData.email}
                    onChange={e => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="captain@starships.ai"
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      value={registerData.password}
                      onChange={e => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Create a strong password"
                      disabled={isLoading}
                      required
                      minLength={8}
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

                <div className="space-y-2">
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

                {(formError || error) && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError || error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>Creating account...</>
                  ) : (
                    <>
                      <Icon name="user-plus" className="h-4 w-4 mr-2" />
                      Create Account
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="text-center">
          <p className="text-xs text-muted-foreground">By signing {activeTab === 'login' ? 'in' : 'up'}, you agree to our Terms of Service and Privacy Policy</p>
        </CardFooter>
      </Card>
    </motion.div>
  )
}
