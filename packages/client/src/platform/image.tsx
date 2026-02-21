import React from 'react'
import { usePlatform } from './context'
import type { PlatformImageProps } from './types'

export default function Image(props: PlatformImageProps) {
  const { Image: Impl } = usePlatform()
  return <Impl {...props} />
}

