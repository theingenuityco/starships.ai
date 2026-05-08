'use client'

import { useRef, useState } from 'react'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import Link from 'next/link'

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function Step2CompanyInfo({
  companyName,
  websiteUrl,
  bio,
  onBack,
  onNext,
}: {
  companyName: string
  websiteUrl: string
  bio: string
  onBack: () => void
  onNext: (websiteUrl: string, bio: string) => void
}) {
  const [url, setUrl] = useState(websiteUrl)
  const [bioValue, setBioValue] = useState(bio)
  const [isFetchingBio, setIsFetchingBio] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  // Track whether current bio was auto-fetched so we can offer a re-fetch button
  const autoFilledRef = useRef(false)

  async function fetchBioFromUrl(targetUrl: string) {
    setIsFetchingBio(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/v1/public/automate/extract-bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: targetUrl }),
      })
      if (!res.ok) throw new Error('fetch_failed')
      const json = (await res.json()) as { data: { bio: string } }
      const extracted = json.data?.bio?.trim()
      if (extracted) {
        setBioValue(extracted)
        autoFilledRef.current = true
      }
    } catch {
      setFetchError("Couldn't fetch your website — please describe your company below.")
    } finally {
      setIsFetchingBio(false)
    }
  }

  function handleUrlBlur() {
    if (!isValidUrl(url)) return
    // Auto-fetch if bio is empty or was previously auto-filled (will be refreshed)
    if (!bioValue.trim() || autoFilledRef.current) {
      fetchBioFromUrl(url.trim())
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedBio = bioValue.trim()
    if (!trimmedBio) return
    onNext(url.trim(), trimmedBio)
  }

  const canSubmit = bioValue.trim().length >= 10

  return (
    <div className="relative min-h-screen flex flex-col text-white" style={{ backgroundColor: '#050b24' }}>
      {/* Minimal header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
          <StarshipsLogo width={28} height={28} className="text-white" />
          <span className="text-sm font-medium tracking-wide text-white/70">starships.ai</span>
        </Link>
        <span className="text-xs text-white/30 tabular-nums">2 / 2</span>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-24">
        <div className="w-full max-w-lg">
          <div className="text-center">
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white leading-tight">
              Tell us about{' '}
              <span className="text-primary">{companyName}</span>
            </h1>
            <p className="mt-4 text-base text-white/50">
              The more you share, the better your customer profiles.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-10 space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Website <span className="text-white/30">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={url}
                  onChange={e => {
                    setUrl(e.target.value)
                    // If user changes the URL, reset the auto-fill flag
                    autoFilledRef.current = false
                  }}
                  onBlur={handleUrlBlur}
                  placeholder="https://yoursite.com"
                  autoComplete="url"
                  className="w-full rounded-none border border-white/20 bg-white/5 px-5 py-3.5 text-base text-white placeholder:text-white/25 outline-none transition-colors focus:border-primary/60 focus:bg-white/8 pr-10"
                />
                {isFetchingBio && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                  </div>
                )}
              </div>
              {fetchError && (
                <p className="mt-1.5 text-xs text-amber-400/80">{fetchError}</p>
              )}
              {!fetchError && isFetchingBio && (
                <p className="mt-1.5 text-xs text-white/35">Fetching from your website…</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-white/60">
                  What does {companyName} do? <span className="text-primary">*</span>
                </label>
                {/* Re-fetch button when bio is already filled and URL is valid */}
                {autoFilledRef.current && isValidUrl(url) && !isFetchingBio && (
                  <button
                    type="button"
                    onClick={() => fetchBioFromUrl(url.trim())}
                    className="text-xs text-white/35 hover:text-white/60 transition-colors"
                  >
                    ↺ Re-fetch
                  </button>
                )}
              </div>
              <div className="relative">
                <textarea
                  value={isFetchingBio ? '' : bioValue}
                  onChange={e => {
                    setBioValue(e.target.value)
                    autoFilledRef.current = false
                  }}
                  disabled={isFetchingBio}
                  placeholder={
                    isFetchingBio
                      ? 'Fetching from your website…'
                      : `Describe what ${companyName} does, who you help, and what problem you solve…`
                  }
                  rows={5}
                  className="w-full resize-none rounded-none border border-white/20 bg-white/5 px-5 py-3.5 text-base text-white placeholder:text-white/30 outline-none transition-colors focus:border-primary/60 focus:bg-white/8 disabled:opacity-50 disabled:cursor-wait"
                />
              </div>
              <div className="mt-1.5 flex justify-end">
                <span className={`text-xs tabular-nums ${bioValue.length > 1800 ? 'text-amber-400' : 'text-white/25'}`}>
                  {bioValue.length} / 2000
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onBack}
                className="rounded-none border border-white/15 bg-transparent px-5 py-3.5 text-sm text-white/60 transition-colors hover:border-white/30 hover:text-white/80"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isFetchingBio}
                className="flex-1 rounded-none bg-primary px-6 py-3.5 text-base font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isFetchingBio ? 'Fetching…' : 'Continue →'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
