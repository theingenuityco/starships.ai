'use client'

import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { EffectComposer as PPComposer, RenderPass, EffectPass, BloomEffect, FXAAEffect } from 'postprocessing'
import { createNeuralLatticeMaterial } from './materials/NeuralLatticeMaterial'
import type { SceneCommonProps } from './types'
import { createWarpRippleEffect } from './effects/WarpRipplePass'

export default function NeuralLatticeScene({
  palette = 'deep-space',
  intensity: intensityPreset = 'cinematic',
  ...rest
}: SceneCommonProps & { triggerRef: React.MutableRefObject<(() => void) | null>; onWarpDone: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const triggerRef = (rest as any).triggerRef as React.MutableRefObject<(() => void) | null>
  const onWarpDone = (rest as any).onWarpDone as () => void

  useEffect(() => {
    if (!mountRef.current) return
    const container = mountRef.current

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    const dpr = Math.min(1.5, window.devicePixelRatio || 1)
    renderer.setPixelRatio(dpr)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setClearColor('#02040a')
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const material = createNeuralLatticeMaterial()
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    scene.add(quad)

    // postprocessing
    const composer = new PPComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new BloomEffect({
      intensity: 0.9 * (intensityPreset === 'cinematic' ? 1 : intensityPreset === 'expressive' ? 0.75 : 0.5),
      luminanceThreshold: 0.15,
      luminanceSmoothing: 0.85,
      radius: 1.0,
    })
    const fxaa = new FXAAEffect()
    const warp = createWarpRippleEffect()
    const effectPass = new EffectPass(camera, bloom, warp, fxaa)
    composer.addPass(effectPass)

    const pointer = new THREE.Vector2(0.5, 0.5)
    const onPointer = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      pointer.set((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
    }
    window.addEventListener('pointermove', onPointer)

    let raf = 0
    let start = performance.now()
    let warpProgress = 0
    let isWarping = false

    triggerRef.current = () => {
      isWarping = true
    }

    const resize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      composer.setSize(w, h)
      material.uniforms.uResolution.value.set(w, h)
    }
    window.addEventListener('resize', resize)
    resize()

    const animate = () => {
      const t = (performance.now() - start) / 1000
      material.uniforms.uTime.value = t
      material.uniforms.uPointer.value.copy(pointer)
      material.uniforms.uChromatic.value = THREE.MathUtils.lerp(material.uniforms.uChromatic.value, 1, 0.1)
      material.uniforms.uIntensity.value = intensityPreset === 'cinematic' ? 1 : intensityPreset === 'expressive' ? 0.75 : 0.5

      if (isWarping) {
        warpProgress += 0.04
        material.uniforms.uWarpProgress.value = warpProgress
        ;(warp as any).progress = warpProgress
        if (warpProgress >= 1.1) {
          isWarping = false
          warpProgress = 0
          material.uniforms.uWarpProgress.value = 0
          setTimeout(() => onWarpDone(), 80)
        }
      }

      composer.render()
      raf = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      composer.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [intensityPreset])

  return <div ref={mountRef} className="absolute inset-0 -z-10" />
}
