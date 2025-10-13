'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

const DEFAULT_SETTINGS_TAB = 'profile'

export default function ShipSettingsIndexPage() {
  const router = useRouter()
  const params = useParams<{ slug: string }>()

  useEffect(() => {
    if (params?.slug) {
      router.replace(`/ship/${params.slug}/settings/${DEFAULT_SETTINGS_TAB}`)
    }
  }, [router, params?.slug])

  return null
}
