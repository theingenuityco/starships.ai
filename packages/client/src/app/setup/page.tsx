import { Suspense } from 'react'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'
import SetupPageClient from '@/app/setup/page-client'

export const dynamic = 'force-static'

export default function SetupPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <SetupPageClient />
    </Suspense>
  )
}
