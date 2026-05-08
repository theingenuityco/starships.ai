'use client'

import { useEffect, useRef, useState } from 'react'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import Link from 'next/link'

export function Step1StartupName({
  companyName,
  onNext,
}: {
  companyName: string
  onNext: (name: string) => void
}) {
  const [value, setValue] = useState(companyName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onNext(trimmed)
  }

  return (
    <div className="relative min-h-screen flex flex-col text-white" style={{ backgroundColor: '#050b24' }}>
      {/* Minimal header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
          <StarshipsLogo width={28} height={28} className="text-white" />
          <span className="text-sm font-medium tracking-wide text-white/70">starships.ai</span>
        </Link>
        <span className="text-xs text-white/30 tabular-nums">1 / 4</span>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-24">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white leading-tight">
            What&apos;s your startup called?
          </h1>
          <p className="mt-4 text-base text-white/50">
            We&apos;ll use this to personalize your customer profiles.
          </p>

          <form onSubmit={handleSubmit} className="mt-10">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="e.g. Acme Inc."
              autoComplete="organization"
              className="w-full rounded-none border border-white/20 bg-white/5 px-5 py-4 text-lg text-white placeholder:text-white/25 outline-none transition-colors focus:border-primary/60 focus:bg-white/8"
            />
            <button
              type="submit"
              disabled={!value.trim()}
              className="mt-5 w-full rounded-none bg-primary px-6 py-4 text-base font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue →
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
