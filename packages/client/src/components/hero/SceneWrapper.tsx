'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { SceneImperativeApi, SceneWrapperProps } from './types'

const NeuralLatticeScene = dynamic(() => import('./NeuralLatticeScene'), { ssr: false })

export default function SceneWrapper({ palette = 'deep-space', intensity = 'cinematic', onWarpDone }: SceneWrapperProps) {
  const triggerRef = useRef<(() => void) | null>(null)

  // reduced motion or low-power fallback guard
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const handleWarp = useCallback(() => {
    if (triggerRef.current) triggerRef.current()
  }, [])

  useEffect(() => {
    const onVis = () => {
      // noop for now; we can pause renders if needed later
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <div className="absolute inset-0 -z-10">
      {prefersReducedMotion ? (
        <div className="w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#071022] via-[#050a16] to-[#02040a]" />
      ) : (
        <NeuralLatticeScene palette={palette} intensity={intensity} {...({ triggerRef, onWarpDone: onWarpDone || (() => {}) } as any)} />
      )}
      {/* Expose an imperative trigger via data attribute (hooked by CTA) */}
      <button data-warp-trigger hidden onClick={handleWarp} />
    </div>
  )
}


