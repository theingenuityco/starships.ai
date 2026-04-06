'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { IcpProfile, IcpAccountPreview } from '@starships/protocol'
import StarryBackground from '@/app/components/StarryBackground'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { DatasetTable } from '../components/DatasetTable'
import Link from 'next/link'

const AUTOMATE_SESSION_KEY = 'automate_pending_data'

export function Step4DatasetPreview({
  companyName,
  icp,
  accounts,
  onBack,
}: {
  companyName: string
  icp: IcpProfile
  accounts: IcpAccountPreview[]
  onBack: () => void
}) {
  const router = useRouter()
  const [showGate, setShowGate] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  function handleExport() {
    // Store the full flow data in sessionStorage so post-auth can provision the dataset
    try {
      window.sessionStorage.setItem(
        AUTOMATE_SESSION_KEY,
        JSON.stringify({
          companyName,
          icp,
          accounts,
          createdAt: Date.now(),
        })
      )
    } catch {
      // Ignore storage errors; redirect still proceeds
    }
    setShowGate(true)
  }

  function handleSignUp() {
    router.push('/login?tab=register&fromAutomate=1')
  }

  function handleLogin() {
    router.push('/login?tab=login&fromAutomate=1')
  }

  return (
    <div className="relative min-h-screen flex flex-col text-white" style={{ backgroundColor: '#050b24' }}>
      <StarryBackground position="absolute" className="opacity-50" />

      {/* Minimal header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
          <StarshipsLogo width={28} height={28} className="text-white" />
          <span className="text-sm font-medium tracking-wide text-white/70">starships.ai</span>
        </Link>
        <span className="text-xs text-white/30 tabular-nums">4 / 4</span>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col items-center px-4 py-10 pb-24">
        <div className="w-full max-w-4xl">
          {/* Header row */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                  Building dataset
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-snug">
                {icp.name}
              </h1>
              <p className="mt-1 text-sm text-white/50">
                {icp.traits.industry} · {icp.traits.companySize} · {icp.traits.geography}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-none border border-white/10 bg-white/5 px-4 py-2 text-center">
                <div className="text-xl font-semibold text-white tabular-nums">
                  ~{icp.estimatedAccountCount.toLocaleString()}
                </div>
                <div className="text-xs text-white/40 mt-0.5">total accounts</div>
              </div>
            </div>
          </div>

          {/* Table */}
          <DatasetTable accounts={accounts} isLoading={false} />

          {/* Footer */}
          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-white/30 hover:text-white/60 transition-colors"
            >
              ← Choose a different profile
            </button>

            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 rounded-none bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 2v8M4 7l4 4 4-4M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Export {icp.estimatedAccountCount.toLocaleString()}+ accounts
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-white/25">
            Showing a preview of {accounts.length} accounts. Sign up to export the full dataset.
          </p>
        </div>
      </div>

      {/* Signup gate overlay */}
      {showGate && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(5, 11, 36, 0.85)', backdropFilter: 'blur(8px)' }}
          onClick={e => {
            if (e.target === overlayRef.current) setShowGate(false)
          }}
        >
          <div className="w-full max-w-md rounded-none border border-white/15 bg-[#0a1235] p-8 shadow-2xl">
            <div className="mb-1 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Dataset ready
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-semibold text-white leading-snug">
              Export your {icp.name} dataset
            </h2>
            <p className="mt-2 text-sm text-white/55 leading-relaxed">
              Create a free account to export{' '}
              <strong className="text-white/80">{icp.estimatedAccountCount.toLocaleString()}+ accounts</strong>{' '}
              and start automating your outreach for {companyName}.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleSignUp}
                className="w-full rounded-none bg-primary py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110"
              >
                Create free account →
              </button>
              <button
                type="button"
                onClick={handleLogin}
                className="w-full rounded-none border border-white/15 bg-transparent py-3 text-sm text-white/60 transition-colors hover:border-white/30 hover:text-white/80"
              >
                I already have an account
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowGate(false)}
              className="mt-5 block w-full text-center text-xs text-white/25 hover:text-white/45 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
