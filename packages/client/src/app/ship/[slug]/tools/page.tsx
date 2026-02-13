import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function StarshipToolsPage({ params }: PageProps) {
  const { slug } = await params
  redirect(`/ship/${encodeURIComponent(slug)}/installed`)
}
