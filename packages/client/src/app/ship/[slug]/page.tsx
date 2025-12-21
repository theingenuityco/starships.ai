import { redirect } from 'next/navigation'

export default function StarshipOverviewPage({ params }: { params: { slug: string } }): never {
  redirect(`/ship/${params.slug}/conversations`)
}
