import { redirect } from 'next/navigation'

export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default function UseCasesRedirectPage() {
  redirect('/use-cases/lead-generation')
}

