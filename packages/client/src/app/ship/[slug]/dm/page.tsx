'use client'

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { useStarshipBySlug } from '@/hooks/useStarships'

export default function DraftDmPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))

  // Guard: this route is only for draft DMs. Otherwise, go to default channel.
  useEffect(() => {
    const dm = (searchParams.get('dm') || '').trim()
    if (dm === 'draft') return
    if (slug) router.replace(`/ship/${slug}`)
  }, [router, searchParams, slug])

  if (!starship?.id) return null

  return (
    <div className="h-screen w-full">
      <ConversationInterface
        starshipId={starship.id}
        conversationId={null}
        starshipSlug={slug}
        onConversationChange={cid => {
          if (cid) {
            router.replace(`/ship/${slug}/conversations/${cid}`)
          } else {
            router.replace(`/ship/${slug}`)
          }
        }}
      />
    </div>
  )
}

