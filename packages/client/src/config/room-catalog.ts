export type RoomCatalogEntry = {
  bundleId: string
  name: string
  description: string
  icon: string
  ensureEndpoint: string
}

export const ROOM_CATALOG: RoomCatalogEntry[] = [
  {
    bundleId: 'lead-generation',
    name: 'Lead Generation',
    description: 'Find and qualify target accounts using AI-powered research',
    icon: '🎯',
    ensureEndpoint: 'ensure-leadgen-room',
  },
]
