import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{
    slug: string
  }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TopupSuccessPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams

  const qp = new URLSearchParams()
  qp.set('topup', 'success')

  const topupId = typeof sp.topupId === 'string' ? sp.topupId : undefined
  const amount = typeof sp.amount === 'string' ? sp.amount : undefined

  if (topupId) qp.set('topupId', topupId)
  if (amount) qp.set('amount', amount)

  redirect(`/ship/${slug}/settings/billing?${qp.toString()}`)
}
