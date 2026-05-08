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

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnvVarState {
  key: string
  group: string
  description: string
  required: boolean
  sensitive: boolean
  default?: string
  placeholder?: string
  needsRestart: boolean
  isSet: boolean
  maskedValue: string | null
}

interface EnvGroupState {
  id: string
  label: string
  vars: EnvVarState[]
}

// Keys shown flat at the top — the minimum a deployer must touch.
const PRIMARY_KEYS = ['PUBLIC_URL', 'POSTGRES_PASSWORD', 'JWT_SECRET', 'OPENROUTER_API_KEY']

// Keys that go into the "Database connection" tier-1 collapsible.
const DB_CONNECTION_KEYS = ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_USER', 'POSTGRES_DATABASE', 'POSTGRES_SSL']

// Keys that go into the "Redis" tier-1 collapsible.
const REDIS_KEYS = ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'REDIS_DB']

const HANDLED_KEYS = new Set([...PRIMARY_KEYS, ...DB_CONNECTION_KEYS, ...REDIS_KEYS])

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${i + 1 === current ? 'w-6 bg-primary' : i + 1 < current ? 'w-3 bg-primary/50' : 'w-3 bg-white/15'}`}
        />
      ))}
      <span className="text-xs text-zinc-500 ml-1">{current} / {total}</span>
    </div>
  )
}

// ── Chevron icon ──────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`text-zinc-600 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ── Single env var input row ──────────────────────────────────────────────────

interface EnvRowProps {
  def: EnvVarState
  value: string
  onChange: (key: string, value: string) => void
}

function EnvRow({ def, value, onChange }: EnvRowProps) {
  const [reveal, setReveal] = React.useState(false)
  // Priority: masked value (sensitive+set) → explicit placeholder → default
  const placeholder = def.sensitive && def.isSet
    ? (def.maskedValue ?? '')
    : (def.placeholder ?? def.default ?? '')

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Label htmlFor={def.key} className="text-[11px] font-mono text-zinc-400 tracking-wide">
          {def.key}
        </Label>
        {def.required && <span className="text-[10px] text-red-400">required</span>}
      </div>
      <div className="flex gap-1">
        <Input
          id={def.key}
          type={def.sensitive && !reveal ? 'password' : 'text'}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(def.key, e.target.value)}
          className="font-mono text-xs h-8 bg-zinc-900 border-zinc-700 focus-visible:ring-zinc-600"
          autoComplete="off"
          data-1p-ignore
        />
        {def.sensitive && (
          <button
            type="button"
            onClick={() => setReveal(v => !v)}
            className="shrink-0 px-2 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {reveal ? 'hide' : 'show'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Tier-1 collapsible group (Database, Redis) ────────────────────────────────

interface EnvGroupProps {
  label: string
  vars: EnvVarState[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}

function EnvGroup({ label, vars, values, onChange }: EnvGroupProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-zinc-900 transition-colors"
      >
        <span className="text-sm text-zinc-300">{label}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3 border-t border-zinc-800">
          {vars.map(def => (
            <EnvRow key={def.key} def={def} value={values[def.key] ?? ''} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tier-2 sub-group (inside "More settings") ─────────────────────────────────

function EnvSubGroup({ label, vars, values, onChange }: EnvGroupProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-2 py-2 text-left hover:bg-zinc-800/60 transition-colors rounded-md"
      >
        <span className="text-xs text-zinc-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600">{vars.length}</span>
          <Chevron open={open} />
        </div>
      </button>
      {open && (
        <div className="pl-3 pr-1 pb-3 pt-1 space-y-3 border-l border-zinc-800 ml-2 mt-0.5">
          {vars.map(def => (
            <EnvRow key={def.key} def={def} value={values[def.key] ?? ''} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── "More settings" tier-1 collapsible with tier-2 sub-groups ────────────────

interface MoreSettingsProps {
  groups: EnvGroupState[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}

function MoreSettings({ groups, values, onChange }: MoreSettingsProps) {
  const [open, setOpen] = React.useState(false)
  const totalVars = groups.reduce((sum, g) => sum + g.vars.length, 0)
  if (totalVars === 0) return null
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-zinc-900 transition-colors"
      >
        <span className="text-sm text-zinc-300">More settings</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-0.5 border-t border-zinc-800">
          {groups.map(group => (
            <EnvSubGroup
              key={group.id}
              label={group.label}
              vars={group.vars}
              values={values}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Step 1: Environment config ────────────────────────────────────────────────

function EnvStep({ onNext }: { onNext: (restartRequired: boolean) => void }) {
  const [allVars, setAllVars] = React.useState<EnvVarState[]>([])
  const [moreGroups, setMoreGroups] = React.useState<EnvGroupState[]>([])
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch('/api/v1/setup/env')
      .then(r => r.json())
      .then(json => {
        const groups: EnvGroupState[] = json.data?.groups ?? []
        const flat = groups.flatMap(g => g.vars)
        setAllVars(flat)

        // Build tier-2 groups for "More settings": keep original group structure,
        // filter out vars already handled in the primary / tier-1 sections.
        const more = groups
          .map(g => ({ ...g, vars: g.vars.filter(v => !HANDLED_KEYS.has(v.key)) }))
          .filter(g => g.vars.length > 0)
        setMoreGroups(more)

        // Pre-fill form from service-defined defaults only.
        // We never pull actual env values into the form — the setup wizard always
        // starts from known defaults so users see a clean, predictable baseline.
        const initial: Record<string, string> = {}
        for (const v of flat) {
          if (v.default !== undefined) {
            initial[v.key] = v.default
          }
        }
        setValues(initial)
      })
      .catch(() => {
        setError('Could not load default configuration — you can still fill in values manually.')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v.trim() !== '') payload[k] = v.trim()
    }

    try {
      const res = await fetch('/api/v1/setup/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to save configuration.')
      onNext(data.data?.restartRequired ?? false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const byKey = Object.fromEntries(allVars.map(v => [v.key, v]))
  const primaryVars = PRIMARY_KEYS.map(k => byKey[k]).filter(Boolean)
  const dbVars = DB_CONNECTION_KEYS.map(k => byKey[k]).filter(Boolean)
  const redisVars = REDIS_KEYS.map(k => byKey[k]).filter(Boolean)

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Primary vars — always visible, no accordion */}
      {primaryVars.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 space-y-3">
          {primaryVars.map(def => (
            <EnvRow key={def.key} def={def} value={values[def.key] ?? ''} onChange={handleChange} />
          ))}
        </div>
      )}

      {/* Tier-1 collapsibles */}
      {dbVars.length > 0 && (
        <EnvGroup label="Database connection" vars={dbVars} values={values} onChange={handleChange} />
      )}
      {redisVars.length > 0 && (
        <EnvGroup label="Redis" vars={redisVars} values={values} onChange={handleChange} />
      )}

      {/* More settings with tier-2 sub-groups */}
      <MoreSettings groups={moreGroups} values={values} onChange={handleChange} />

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save & continue'}
        </Button>
        <button
          type="button"
          onClick={() => onNext(false)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline-offset-2 hover:underline"
        >
          Skip for now
        </button>
      </div>
    </form>
  )
}

// ── Step 2: Admin account ─────────────────────────────────────────────────────

function AdminStep({ onBack, restartRequired }: { onBack: () => void; restartRequired: boolean }) {
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
      {restartRequired && (
        <Alert>
          <AlertDescription>
            Some saved settings require a server restart to take effect. Restart the server before continuing if changes aren&apos;t reflected.
          </AlertDescription>
        </Alert>
      )}
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

      <button
        type="button"
        onClick={onBack}
        className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline-offset-2 hover:underline"
      >
        ← Back to environment settings
      </button>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SetupPageClient() {
  const router = useRouter()
  const [statusChecked, setStatusChecked] = React.useState(false)
  const [step, setStep] = React.useState<1 | 2>(1)
  const [envRestartRequired, setEnvRestartRequired] = React.useState(false)

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

  const meta: Record<1 | 2, { heading: string; sub: string }> = {
    1: { heading: 'Configure environment', sub: 'Set credentials and API keys for this instance.' },
    2: { heading: 'Create admin account', sub: 'This account will have full control over the instance.' },
  }

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

            <StepIndicator current={step} total={2} />

            <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-5 text-center">
              <p className="font-semibold text-foreground">{meta[step].heading}</p>
              <p className="text-sm text-zinc-500 mt-1">{meta[step].sub}</p>
            </motion.div>

            <motion.div key={`c-${step}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
              {step === 1
                ? <EnvStep onNext={(restartRequired) => { setEnvRestartRequired(restartRequired); setStep(2) }} />
                : <AdminStep onBack={() => setStep(1)} restartRequired={envRestartRequired} />
              }
            </motion.div>
          </div>
        </div>
      </div>
    </StarTheme>
  )
}
