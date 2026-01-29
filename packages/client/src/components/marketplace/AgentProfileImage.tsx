'use client'

import { useState } from 'react'

interface AgentProfileImageProps {
  src: string
  alt: string
  className?: string
  style?: React.CSSProperties
}

export function AgentProfileImage({ src, alt, className, style }: AgentProfileImageProps) {
  const [imageError, setImageError] = useState(false)

  if (imageError) {
    return null
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        ...style,
        objectFit: 'contain', // Ensure full image is visible, no cropping
        maxWidth: '100%',
      }}
      onError={() => setImageError(true)}
    />
  )
}
