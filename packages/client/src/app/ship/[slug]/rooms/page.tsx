'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipRooms } from '@/hooks/useRooms'
import { PageHeader } from '@/components/ui/PageHeader'

export default function RoomsPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const { data: starship } = useStarshipBySlug(slug, !!slug)
  const starshipId = starship?.id ?? ''
  const { data, isLoading } = useStarshipRooms(starshipId, !!starshipId)
  const rooms = data?.rooms ?? []

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title="Rooms" />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rooms yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link
                href={`/ship/${slug}/rooms/${room.slug}`}
                className="block rounded-md border border-border px-4 py-3 hover:bg-accent"
              >
                <span className="font-medium">{room.name}</span>
                {room.topic ? <span className="ml-2 text-sm text-muted-foreground">{room.topic}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
