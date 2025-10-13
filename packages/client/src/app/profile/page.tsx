'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProfilePage(): React.JSX.Element {
  const router = useRouter()

  useEffect(() => {
    router.replace('/ship')
  }, [router])

  return null
}
