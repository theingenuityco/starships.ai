import { redirect } from 'next/navigation'

export default async function StarshipOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<never> {
  const { slug } = await params
  redirect(`/ship/${slug}/conversations`)
}
