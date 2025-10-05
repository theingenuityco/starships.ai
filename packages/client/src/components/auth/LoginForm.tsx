'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WaitlistMessage } from '@/components/auth/WaitlistMessage'
import { useAuth } from '@/hooks/useAuth'
import { useOAuthLogin } from '@/hooks/useOAuth'
import { Eye, EyeOff, LogIn, UserPlus, Github, Chrome } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'

/**
 * OAuth button component
 */
const OAuthButtons = ({ disabled }: { disabled: boolean }) => {
  const { initiateOAuth } = useOAuthLogin();

  return (
    <div className="space-y-3 mb-6">
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={() => initiateOAuth('google')}
          disabled={disabled}
          className="w-full"
        >
          <Chrome className="h-4 w-4 mr-2" />
          Google
        </Button>

        <Button
          variant="outline"
          onClick={() => initiateOAuth('github')}
          disabled={disabled}
          className="w-full"
        >
          <Github className="h-4 w-4 mr-2" />
          GitHub
        </Button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with email
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * OAuth error handling helper
 */
function getOAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'invalid_state':
      return 'Security validation failed. Please try again.';
    case 'provider_error':
      return 'Authentication provider error. Please try again.';
    case 'validation_failed':
      return 'Account validation failed. Please contact support.';
    case 'callback_failed':
      return 'Authentication failed. Please try again.';
    default:
      return 'Login failed. Please try again.';
  }
}

/**
 * JWT-based login and registration form
 */
export function LoginForm() {
  const { login, register, isLoading, error } = useAuth()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

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

  // OAuth callback handling
  useEffect(() => {
    const oauthToken = searchParams?.get('oauth_token');
    const oauthError = searchParams?.get('oauth_error');
    const oauthWaitlist = searchParams?.get('oauth_waitlist');

    if (oauthToken) {
      // Store the token and invalidate queries to refetch with new auth context
      localStorage.setItem('starships_auth_token', oauthToken);
      queryClient.invalidateQueries(); // Refetch all queries with new auth context
      window.location.href = '/'; // Redirect to main app
    } else if (oauthError) {
      setFormError(getOAuthErrorMessage(oauthError));
    } else if (oauthWaitlist) {
      setWaitlistStatus({
        isWaitlisted: true,
        message: 'Thanks for signing up! Please wait for approval to access the app.'
      });
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setWaitlistStatus(null)

    if (!loginData.email || !loginData.password) {
      setFormError('Please fill in all fields')
      return
    }

    const result = await login(loginData.email, loginData.password)
    
    // Check if waitlisted response
    if (result.waitlisted) {
      setWaitlistStatus({
        isWaitlisted: true,
        message: result.message || 'You are on our waitlist. Stay tuned!'
      })
      return
    }
    
    if (!result.success) {
      setFormError(result.error || 'Login failed')
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setWaitlistStatus(null)

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
        message: result.message || 'You have been added to the waitlist!'
      })
      // Optionally clear form
      setRegisterData({ email: '', password: '', name: '', confirmPassword: '' })
      return
    }
    
    if (!result.success) {
      setFormError(result.error || 'Registration failed')
    }
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
          <OAuthButtons disabled={isLoading || !!waitlistStatus} />

          {waitlistStatus && (
            <div className="mb-4">
              <WaitlistMessage
                message={waitlistStatus.message}
                onClose={() => setWaitlistStatus(null)}
              />
            </div>
          )}
          
          <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign In
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="space-y-4">
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
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                      <UserPlus className="h-4 w-4 mr-2" />
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
