import { Suspense } from 'react'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'
import LoginPageClient from '@/app/login/page-client'

// Auth entry points should be statically generated.
export const dynamic = 'force-static'

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <LoginPageClient />
    </Suspense>
  )
}
