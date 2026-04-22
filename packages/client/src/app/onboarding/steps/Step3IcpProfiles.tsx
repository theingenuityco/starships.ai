'use client'

import { useEffect, useState } from 'react'
import type { IcpProfile, IcpAccountPreview } from '@starships/protocol'
import StarryBackground from '@/app/components/StarryBackground'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { IcpProfileCard } from '../components/IcpProfileCard'
import Link from 'next/link'

export function Step3IcpProfiles({
  companyName,
  websiteUrl,
  bio,
  onBack,
  onSelect,
}: {
  companyName: string
  websiteUrl: string
  bio: string
  onBack: () => void
  onSelect: (icp: IcpProfile, accounts: IcpAccountPreview[]) => void
}) {
  const [profiles, setProfiles] = useState<IcpProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetchProfiles() {
      try {
        setIsLoading(true)
        setError(null)
        const res = await fetch('/api/v1/public/automate/suggest-icps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName, websiteUrl: websiteUrl || undefined, bio }),
        })
        if (!res.ok) throw new Error('Failed to generate profiles')
        const json = (await res.json()) as { data: { profiles: IcpProfile[] } }
        if (!cancelled) setProfiles(json.data.profiles ?? [])
      } catch {
        if (!cancelled) setError('Something went wrong. Please try again.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchProfiles()
    return () => { cancelled = true }
  }, [companyName, websiteUrl, bio, retryCount])

  async function handleSelect(profile: IcpProfile) {
    setSelectingId(profile.id)
    try {
      const res = await fetch('/api/v1/public/automate/preview-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, icp: profile }),
      })
      if (!res.ok) throw new Error('Failed to generate accounts')
      const json = (await res.json()) as { data: { accounts: IcpAccountPreview[] } }
      onSelect(profile, json.data.accounts ?? [])
    } catch {
      setSelectingId(null)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col text-white" style={{ backgroundColor: '#050b24' }}>
      <StarryBackground position="absolute" className="opacity-60" />

      {/* Minimal header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
          <StarshipsLogo width={28} height={28} className="text-white" />
          <span className="text-sm font-medium tracking-wide text-white/70">starships.ai</span>
        </Link>
        <span className="text-xs text-white/30 tabular-nums">3 / 4</span>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col items-center px-4 py-12 pb-24">
        <div className="w-full max-w-3xl">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <LoadingSpinner />
              <p className="mt-6 text-base text-white/50">Analyzing {companyName}…</p>
              <p className="mt-1 text-sm text-white/30">Identifying your ideal customer profiles</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <p className="text-white/60">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setProfiles([])
                  setRetryCount(c => c + 1)
                }}
                className="mt-6 rounded-none border border-white/15 px-5 py-2.5 text-sm text-white/60 hover:border-white/30 hover:text-white/80 transition-colors"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-10">
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">
                  Your ideal customer profiles
                </h1>
                <p className="mt-3 text-base text-white/50">
                  Pick one to see matching accounts for {companyName}.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {profiles.map(profile => (
                  <div key={profile.id} className="relative">
                    {selectingId === profile.id && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#050b24]/60 backdrop-blur-sm">
                        <LoadingSpinner size="sm" />
                      </div>
                    )}
                    <IcpProfileCard
                      profile={profile}
                      onClick={() => !selectingId && handleSelect(profile)}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={onBack}
                  disabled={!!selectingId}
                  className="text-sm text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
                >
                  ← Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-5 w-5 border-2' : 'h-8 w-8 border-2'
  return (
    <div
      className={`${cls} animate-spin rounded-full border-white/20 border-t-primary`}
      role="status"
      aria-label="Loading"
    />
  )
}
