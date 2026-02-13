'use client'

import { memo, useMemo, useState } from 'react'
import Icon from '@/components/primitives/Icon'
import { getConnectorLogoSrc } from '@/utils/connectorLogos'

function ConnectorLogoImpl({
  provider,
  className,
}: {
  provider: string
  className?: string
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const src = useMemo(() => {
    const safe = String(provider || '').trim()
    if (!safe) return null
    return getConnectorLogoSrc(safe)
  }, [provider])

  if (failed || !src) {
    return <Icon name="plug" className={className ?? 'h-5 w-5 text-muted-foreground'} aria-hidden />
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className ?? 'h-5 w-5'} onError={() => setFailed(true)} />
}

export const ConnectorLogo = memo(ConnectorLogoImpl)

