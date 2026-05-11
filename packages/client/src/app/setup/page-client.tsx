'use client'

import * as React from 'react'
import { motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { Orbitron } from 'next/font/google'
import { AUTH_QUERY_KEYS, setStoredToken } from '@/hooks/useAuth'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'
import { AuthMarketingPanel } from '@/components/auth/AuthMarketingPanel'
import { StarTheme } from '@/components/theme-context'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter'
import { useQueryClient } from '@tanstack/react-query'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

// ── Admin account step ────────────────────────────────────────────────────────

function AdminStep() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [displayName, setDisplayName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/v1/setup/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.data) {
        throw new Error(data.error?.message || 'Setup failed. Please check your details and try again.')
      }

      const { user, token, starship } = data.data
      setStoredToken(token)
      queryClient.setQueryData(AUTH_QUERY_KEYS.me(), user)
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me() })

      if (starship?.slug) {
        router.push(`/ship/${starship.slug}`)
      } else {
        router.push('/account')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="displayName">
          Display name <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="displayName"
          type="text"
          placeholder="Your name"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          autoComplete="name"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="admin@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        {password.length > 0 && <PasswordStrengthMeter password={password} />}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create admin account'}
      </Button>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SetupPageClient() {
  const router = useRouter()
  const [statusChecked, setStatusChecked] = React.useState(false)

  React.useEffect(() => {
    fetch('/api/v1/setup/status')
      .then(r => r.json())
      .then(json => {
        if (!json.data?.setupRequired) {
          router.replace('/login')
        } else {
          setStatusChecked(true)
        }
      })
      .catch(() => setStatusChecked(true))
  }, [router])

  if (!statusChecked) return <AuthLoadingScreen />

  return (
    <StarTheme theme="dark">
      <div className="min-h-[100dvh] bg-black relative overflow-hidden flex items-center justify-center">
        <AuthMarketingPanel className="fixed inset-0" />

        <header className="fixed top-4 sm:top-8 left-0 right-0 z-50">
          <div className="px-4 sm:px-8 flex items-center h-8">
            <span className="flex items-center gap-2">
              <StarshipsLogo width={32} height={32} className="text-foreground" idleLoop={false} playOnMountOnce={false} />
              <span className={`${orbitron.className} text-lg sm:text-xl md:text-2xl font-normal tracking-tight leading-none`}>
                starships.ai
              </span>
            </span>
          </div>
        </header>

        <div className="w-full flex items-center justify-center px-6 py-16 relative z-10">
          <div className="w-full max-w-md">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-4 text-center">
              <h1 className="text-2xl font-bold text-primary">Set up your instance</h1>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-5 text-center">
              <p className="font-semibold text-foreground">Create admin account</p>
              <p className="text-sm text-zinc-500 mt-1">This account will have full control over the instance.</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
              <AdminStep />
            </motion.div>
          </div>
        </div>
      </div>
    </StarTheme>
  )
}
