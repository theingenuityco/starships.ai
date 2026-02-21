import React from 'react'
import { usePlatform } from './context'
import type { PlatformLinkProps } from './types'

export default function Link(props: PlatformLinkProps) {
  const { Link: Impl } = usePlatform()
  return <Impl {...props} />
}

