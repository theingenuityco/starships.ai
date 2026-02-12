import { redirect } from 'next/navigation'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function toQueryString(params: Record<string, string | string[] | undefined> | null | undefined): string {
  const sp = new URLSearchParams()
  const p = params ?? {}
  for (const [k, v] of Object.entries(p)) {
    if (k === 'tab') continue
    if (typeof v === 'string' && v.length) sp.set(k, v)
    else if (Array.isArray(v)) for (const item of v) if (typeof item === 'string' && item.length) sp.append(k, item)
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export default async function MarketplaceRedirectPage(props: PageProps) {
  const searchParams = (await props.searchParams) ?? {}
  const tabRaw = searchParams?.tab
  const tab = typeof tabRaw === 'string' ? tabRaw : Array.isArray(tabRaw) ? tabRaw[0] : ''
  const t = String(tab || '').trim().toLowerCase()
  const dest = t === 'agents' ? '/explore/agents' : t === 'tools' ? '/explore/tools' : t === 'connectors' ? '/explore/connectors' : '/explore'
  redirect(`${dest}${toQueryString(searchParams)}`)
}
