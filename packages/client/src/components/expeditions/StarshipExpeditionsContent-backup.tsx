'use client'

export function StarshipExpeditionsContent({ slug }: { slug: string }) {
  return (
    <div className="h-full flex flex-col">
      <h1>Expeditions for {slug}</h1>
    </div>
  )
}