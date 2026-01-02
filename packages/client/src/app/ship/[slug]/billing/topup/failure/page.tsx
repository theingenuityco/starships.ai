import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{
    slug: string
  }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TopupFailurePage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams

  const qp = new URLSearchParams()
  qp.set('topup', 'cancelled')

  const topupId = typeof sp.topupId === 'string' ? sp.topupId : undefined
  const reason = typeof sp.reason === 'string' ? sp.reason : undefined
  const status = typeof sp.status === 'string' ? sp.status : undefined

  if (topupId) qp.set('topupId', topupId)
  if (reason) qp.set('reason', reason)
  if (status) qp.set('status', status)

  redirect(`/ship/${slug}/settings/billing?${qp.toString()}`)
}
