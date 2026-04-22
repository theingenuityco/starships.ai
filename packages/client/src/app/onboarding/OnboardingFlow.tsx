'use client'

import { useState } from 'react'
import type { IcpProfile, IcpAccountPreview } from '@starships/protocol'
import { Step1StartupName } from './steps/Step1StartupName'
import { Step2CompanyInfo } from './steps/Step2CompanyInfo'
import { Step3IcpProfiles } from './steps/Step3IcpProfiles'
import { Step4DatasetPreview } from './steps/Step4DatasetPreview'

export type OnboardingFlowData = {
  companyName: string
  websiteUrl: string
  bio: string
  selectedIcp: IcpProfile | null
  previewAccounts: IcpAccountPreview[]
}

const INITIAL_DATA: OnboardingFlowData = {
  companyName: '',
  websiteUrl: '',
  bio: '',
  selectedIcp: null,
  previewAccounts: [],
}

export function OnboardingFlow() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingFlowData>(INITIAL_DATA)

  function update(patch: Partial<OnboardingFlowData>) {
    setData(prev => ({ ...prev, ...patch }))
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
          onNext={(websiteUrl, bio) => {
            update({ websiteUrl, bio })
            setStep(3)
          }}
        />
      )}
      {step === 3 && (
        <Step3IcpProfiles
          companyName={data.companyName}
          websiteUrl={data.websiteUrl}
          bio={data.bio}
          onBack={() => setStep(2)}
          onSelect={(icp, accounts) => {
            update({ selectedIcp: icp, previewAccounts: accounts })
            setStep(4)
          }}
        />
      )}
      {step === 4 && data.selectedIcp && (
        <Step4DatasetPreview
          companyName={data.companyName}
          icp={data.selectedIcp}
          accounts={data.previewAccounts}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  )
}
