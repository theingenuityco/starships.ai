'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Step1StartupName } from './steps/Step1StartupName'
import { Step2CompanyInfo } from './steps/Step2CompanyInfo'

const AUTOMATE_SESSION_KEY = 'automate_pending_data'

export type OnboardingFlowData = {
  companyName: string
  websiteUrl: string
  bio: string
}

const INITIAL_DATA: OnboardingFlowData = {
  companyName: '',
  websiteUrl: '',
  bio: '',
}

export function OnboardingFlow() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingFlowData>(INITIAL_DATA)
  const [showGate, setShowGate] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  function update(patch: Partial<OnboardingFlowData>) {
    setData(prev => ({ ...prev, ...patch }))
  }

  function handleShowGate(websiteUrl: string, bio: string) {
    const updated = { ...data, websiteUrl, bio }
    setData(updated)
    try {
      window.localStorage.setItem(
        AUTOMATE_SESSION_KEY,
        JSON.stringify({ ...updated, createdAt: Date.now() })
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
    <div className="min-h-screen" style={{ backgroundColor: '#050b24' }}>
      {step === 1 && (
        <Step1StartupName
          companyName={data.companyName}
          onNext={name => {
            update({ companyName: name })
            setStep(2)
          }}
        />
      )}
      {step === 2 && (
        <Step2CompanyInfo
          companyName={data.companyName}
          websiteUrl={data.websiteUrl}
          bio={data.bio}
          onBack={() => setStep(1)}
          onNext={handleShowGate}
        />
      )}

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
                Almost there
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-semibold text-white leading-snug">
              Set up your workspace
            </h2>
            <p className="mt-2 text-sm text-white/55 leading-relaxed">
              Create a free account to set up your workspace for{' '}
              <strong className="text-white/80">{data.companyName}</strong>.
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
