import { redirect } from 'next/navigation'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function toQueryString(params: Record<string, string | string[] | undefined> | null | undefined): string {
  const sp = new URLSearchParams()
  const p = params ?? {}
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' && v.length) sp.set(k, v)
    else if (Array.isArray(v)) for (const item of v) if (typeof item === 'string' && item.length) sp.append(k, item)
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export default async function MarketplaceRedirectPage(props: PageProps) {
  const searchParams = (await props.searchParams) ?? {}
  redirect(`/explore${toQueryString(searchParams)}`)
}
