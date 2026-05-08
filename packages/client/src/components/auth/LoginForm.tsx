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
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { PasswordStrengthMeter, PasswordLabelWithTooltip } from '@/components/ui/password-strength-meter'
import { validatePassword } from '@/utils/passwordStrength'
import { track } from '@/lib/analytics'

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
type AuthTab = 'login' | 'register'

const authPrimaryButtonClass =
  'relative w-full h-12 rounded-lg text-sm font-semibold text-slate-900 bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_4px_0_0_rgba(180,83,9,1)] hover:brightness-110 active:shadow-[0_2px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px] transition-transform transition-shadow disabled:opacity-100 disabled:bg-amber-400 disabled:text-white'

function isAuthTab(value: string): value is AuthTab {
  return value === 'login' || value === 'register'
}

export function LoginForm({
  onTabChange,
  defaultTab = 'login',
  embedded = false,
}: {
  onTabChange?: (tab: AuthTab) => void
  defaultTab?: AuthTab
  /**
   * When true, renders the form without visible Card chrome.
   * Useful for embedding in other flows (e.g. connector install).
   */
  embedded?: boolean
}) {
  const { login, register, oauthLogin, resendVerification, isLoading } = useAuth()
  const searchParams = useSearchParams()

  // OAuth initiation function - uses relative URL like regular auth
  const initiateOAuth = (provider: 'google' | 'github') => {
    track({ type: 'auth_oauth_clicked', provider })
    if (typeof window === 'undefined') return

    // Prefer an explicit returnUrl if present (e.g. /login?returnUrl=...),
    // otherwise, only set returnUrl automatically for connector install flows.
    const params = new URLSearchParams(window.location.search)
    const explicitReturnUrl = params.get('returnUrl')
    const isConnectorInstall = window.location.pathname.startsWith('/connectors/') && window.location.pathname.includes('/install')
    const returnUrl = explicitReturnUrl || (isConnectorInstall ? `${window.location.pathname}${window.location.search}` : null)

    const authUrl = new URL(`/api/v1/auth/${provider}`, window.location.origin)
    if (returnUrl) {
      authUrl.searchParams.set('returnUrl', returnUrl)
    }
    window.location.href = `${authUrl.pathname}${authUrl.search}`
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
  const [activeTab, setActiveTab] = useState<AuthTab>(defaultTab)
  const [formError, setFormError] = useState<string | null>(null)
  const [emailVerificationStatus, setEmailVerificationStatus] = useState<{
    needsVerification: boolean
    email: string
    message: string
  } | null>(null)
  const [autoSwitchedToRegister, setAutoSwitchedToRegister] = useState(false)

  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  // If the URL includes an expectedEmail (e.g. invite flow), prefill email fields.
  // Never overwrite a value the user already typed.
  useEffect(() => {
    const expectedEmail = (searchParams?.get('expectedEmail') || '').trim()
    if (!expectedEmail) return

    setLoginData(prev => (prev.email.trim() ? prev : { ...prev, email: expectedEmail }))
    setRegisterData(prev => (prev.email.trim() ? prev : { ...prev, email: expectedEmail }))
  }, [searchParams])

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
        ;(async () => {
          try {
            const result = await oauthLogin(authCode)
            if (!result.success) {
              setFormError(result.error || 'Login failed. Please try again.')
            }
          } finally {
            // Prevent re-running OAuth exchange on refresh/back navigation.
            if (typeof window !== 'undefined') {
              const params = new URLSearchParams(window.location.search)
              params.delete('auth_code')
              const query = params.toString()
              const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
              window.history.replaceState(null, '', newUrl)
            }
          }
        })()
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
    track({ type: 'auth_login_submitted' })
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
    track({ type: 'auth_register_submitted' })
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

    // Emails disabled: user is already verified — switch to login tab
    setActiveTab('login')
    onTabChange?.('login')
    setLoginData(prev => ({ ...prev, email: registerData.email }))
    setRegisterData({ email: '', password: '', name: '', confirmPassword: '' })
    setEmailVerificationStatus({
      needsVerification: false,
      email: registerData.email,
      message: result.message || 'Registration successful! You can now sign in.',
    })
  }

  // Resend verification handler following established patterns
  const handleResendVerification = async (email: string) => {
    track({ type: 'auth_resend_verification_clicked' })
    await resendVerification(email)
  }

  const termsAndPrivacy = (
    <p className="text-xs text-muted-foreground/80 text-center">
      By continuing, you agree to our{' '}
      <a href="/terms" target="_blank" className="text-primary/90 hover:text-primary hover:underline underline-offset-2" onClick={() => track({ type: 'auth_terms_clicked' })}>
        Terms of Service
      </a>{' '}
      and{' '}
      <a href="/privacy" target="_blank" className="text-primary/90 hover:text-primary hover:underline underline-offset-2" onClick={() => track({ type: 'auth_privacy_clicked' })}>
        Privacy Policy
      </a>
      .
    </p>
  )

  // Smoothly animate the card height (sign-in <-> sign-up) without layout transforms.
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null)
  const [overflowVisible, setOverflowVisible] = useState(false)

  // Ensure we never show overflow during a tab switch (prevents brief "content outside" flashes).
  useLayoutEffect(() => {
    setOverflowVisible(false)
  }, [activeTab])

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return

    const measure = () => {
      const next = el.getBoundingClientRect().height
      if (Number.isFinite(next) && next >= 0) setMeasuredHeight(next)
    }

    measure()

    const ro = new ResizeObserver(() => {
      setOverflowVisible(false)
      measure()
    })
    ro.observe(el)

    return () => ro.disconnect()
  }, [])

  const cardInner = (
    <Card className={embedded ? 'border-0 bg-transparent shadow-none' : undefined}>
      <CardContent className={embedded ? 'p-0 pt-0' : 'pt-6'}>
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
            if (!isAuthTab(value)) return
            setActiveTab(value)
            track({ type: 'auth_tab_changed', tab: value })
            onTabChange?.(value) // Notify parent of tab change
            setAutoSwitchedToRegister(false) // Clear flag when user manually switches tabs
            setFormError(null) // Clear form errors when switching tabs
          }}
        >
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-border/60 bg-card py-1 shadow-sm">
            <TabsTrigger value="login" className="rounded-md">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="register" className="rounded-md">
              Sign Up
            </TabsTrigger>
          </TabsList>

          <motion.div layout transition={{ layout: { duration: 0.25 } }} className="mt-2">
            <AnimatePresence mode="wait" initial={false}>
              {activeTab === 'login' ? (
                <motion.div key="tab-login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
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

                    <Button type="submit" className={authPrimaryButtonClass} disabled={isLoading}>
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
                      <Button variant="ghost" className="w-full hover:bg-accent/60" asChild>
                        <Link href="/forgot-password" onClick={() => track({ type: 'auth_forgot_password_clicked' })}>
                          Forgot your password?
                        </Link>
                      </Button>
                    </div>
                  </form>
                </motion.div>
              ) : (
                <motion.div key="tab-register" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
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
                        className="h-12"
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
                        className="h-12"
                      />
                    </div>

                    <div className="space-y-2">
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

                    <Button type="submit" className={authPrimaryButtonClass} disabled={isLoading}>
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
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </Tabs>

        {/* OAuth buttons BELOW email forms */}
        <div className="mt-4">
          <OAuthButtons position="bottom" onGoogleClick={() => initiateOAuth('google')} onGitHubClick={() => initiateOAuth('github')} disabled={isLoading} />
        </div>

        <div className="mt-4">{termsAndPrivacy}</div>
      </CardContent>
    </Card>
  )

  // Embedded mode should not animate independently (parent flow controls transitions).
  if (embedded) {
    return <div className="w-full">{cardInner}</div>
  }

  return (
    <motion.div className="w-full max-w-md" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.4 }}>
      <motion.div
        animate={measuredHeight === null ? {} : { height: measuredHeight }}
        transition={{ duration: 0.28 }}
        onAnimationComplete={() => setOverflowVisible(true)}
        style={{ overflow: overflowVisible ? 'visible' : 'hidden' }}
      >
        <div ref={measureRef}>{cardInner}</div>
      </motion.div>
    </motion.div>
  )
}
