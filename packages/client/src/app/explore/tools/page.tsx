import { redirect } from 'next/navigation'

export default async function ExploreToolsPage() {
  // Back-compat: keep old route working, but send users to the new UI path.
  redirect('/explore/automations')
}

