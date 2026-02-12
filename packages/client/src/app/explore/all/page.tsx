import { redirect } from 'next/navigation'

export default async function ExploreAllRedirectPage() {
  // Back-compat: keep old route working.
  redirect('/explore')
}

