import AcceptInvitePageClient from './AcceptInvitePageClient'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Suspense } from 'react'

function AcceptInviteFallback() {
  return (
    <div className="mx-auto mt-12 max-w-xl px-4">
      <Card>
        <CardHeader>
          <CardTitle>Accept invite</CardTitle>
          <CardDescription>Join a starship as a collaborator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Loading invite…</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AcceptInvitePage() {
  // Required by Next.js when using `useSearchParams()` on a pre-rendered route.
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInvitePageClient />
    </Suspense>
  )
}

