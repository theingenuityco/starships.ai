'use client'

// Usage metering was removed in the org-layer pivot. Placeholder kept so the
// settings tab renders; reintroduce billing here later (likely per-seat).
export default function ShipManagement(_props: { starshipId?: string }) {
  return (
    <div className="p-6 text-sm text-muted-foreground">
      Usage and billing are not available in this version.
    </div>
  )
}
