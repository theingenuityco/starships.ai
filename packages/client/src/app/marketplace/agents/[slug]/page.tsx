import { redirect } from 'next/navigation'

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function MarketplaceAgentRedirectPage(props: PageProps) {
  const { slug } = await props.params
  const s = String(slug ?? '').trim()
  redirect(`/explore/agents/${encodeURIComponent(s)}`)
}

