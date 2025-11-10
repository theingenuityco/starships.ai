
import React from 'react'
import * as Radix from '@radix-ui/react-icons'
import { Icon as Iconify } from '@iconify/react'
import * as Phosphor from 'phosphor-react'
import { resolveIcon } from './iconMap'
import type { ResolvedIcon } from './iconMap'

type IconProps = {
  name: string
  label?: string
  size?: number | string
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  strokeWidth?: number
  className?: string
  color?: string
  iconOverride?: ResolvedIcon
  [key: string]: any
}

export function Icon({ name, label, size = 20, weight = 'regular', className, color, iconOverride, ...rest }: IconProps) {
  const resolved = iconOverride ?? resolveIcon(name)

  if (resolved?.type === 'phosphor') {
    const P = (Phosphor as any)[resolved.component]
    if (!P) return null
    return (
      <P
        size={size as any}
        weight={weight as any}
        color={color as any}
        className={className}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        {...rest}
      />
    )
  }

  if (resolved?.type === 'radix') {
    const R = (Radix as any)[resolved.component]
    if (!R) return null
    return (
      <R
        width={size as any}
        height={size as any}
        className={className}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        {...rest}
      />
    )
  }

  if (resolved?.type === 'iconify') {
    return (
      <Iconify
        icon={resolved.icon}
        width={size as any}
        height={size as any}
        className={className}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        {...rest}
      />
    )
  }

  return null
}

export default Icon


