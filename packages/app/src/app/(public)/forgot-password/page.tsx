import ForgotPasswordPageClient from './page-client'

// Auth entry points should be statically generated.
export const dynamic = 'force-static'

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />
}

