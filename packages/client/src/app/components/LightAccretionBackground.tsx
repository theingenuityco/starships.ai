'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type LayerBundle = {
  ring: HTMLCanvasElement
  disk: HTMLCanvasElement
  dust: HTMLCanvasElement
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function makeLayer(size: number, draw: (ctx: CanvasRenderingContext2D, r: () => number, size: number) => void, seed: number) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d', { alpha: true })!
  const r = mulberry32(seed)
  draw(ctx, r, size)
  return c
}

function drawRingLayer(ctx: CanvasRenderingContext2D, r: () => number, size: number) {
  const cx = size / 2
  const cy = size / 2
  ctx.clearRect(0, 0, size, size)

  // Soft vignette so it fades into the page
  const vig = ctx.createRadialGradient(cx, cy, size * 0.06, cx, cy, size * 0.48)
  vig.addColorStop(0, 'rgba(2,6,23,0)')
  vig.addColorStop(0.65, 'rgba(2,6,23,0)')
  vig.addColorStop(1, 'rgba(2,6,23,0.06)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, size, size)

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.08)
  ctx.scale(1.08, 0.76)

  const base = 'rgba(2,6,23,'

  // Glow pass
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'blur(10px)'
  for (let i = 0; i < 14; i++) {
    const rr = size * (0.18 + r() * 0.02) + i * 1.8
    ctx.beginPath()
    ctx.arc(0, 0, rr, 0, Math.PI * 2)
    ctx.strokeStyle = `${base}${0.035 + i * 0.001})`
    ctx.lineWidth = 28 - i * 1.3
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  // Crisp ring (lots of short streaks)
  ctx.filter = 'blur(0px)'
  for (let band = 0; band < 5; band++) {
    const radius = size * (0.22 + band * 0.012)
    const streaks = 170 + band * 50
    for (let i = 0; i < streaks; i++) {
      const a0 = r() * Math.PI * 2
      const len = (0.02 + r() * 0.09) * (r() < 0.25 ? 2.2 : 1)
      const lw = 0.7 + r() * 2.8 + band * 0.25
      const alpha = 0.05 + r() * 0.25

      ctx.beginPath()
      ctx.arc(0, 0, radius + (r() - 0.5) * 8, a0, a0 + len)
      ctx.strokeStyle = `${base}${alpha})`
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.stroke()
    }
  }

  // Slight inner shadow to imply an event horizon (kept very subtle)
  ctx.globalCompositeOperation = 'multiply'
  ctx.filter = 'blur(14px)'
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.19, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(2,6,23,0.18)'
  ctx.lineWidth = 38
  ctx.stroke()

  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'none'
}

function drawDiskLayer(ctx: CanvasRenderingContext2D, r: () => number, size: number) {
  const cx = size / 2
  const cy = size / 2
  ctx.clearRect(0, 0, size, size)

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.03)

  // Main accretion band (wide + blurred)
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'blur(10px)'
  const grad = ctx.createLinearGradient(-size * 0.55, 0, size * 0.55, 0)
  grad.addColorStop(0, 'rgba(2,6,23,0.00)')
  grad.addColorStop(0.18, 'rgba(2,6,23,0.10)')
  grad.addColorStop(0.5, 'rgba(2,6,23,0.22)')
  grad.addColorStop(0.82, 'rgba(2,6,23,0.10)')
  grad.addColorStop(1, 'rgba(2,6,23,0.00)')
  ctx.fillStyle = grad
  ctx.fillRect(-size * 0.55, -14, size * 1.1, 28)

  // Bright core streak
  ctx.filter = 'blur(4px)'
  const grad2 = ctx.createLinearGradient(-size * 0.6, 0, size * 0.6, 0)
  grad2.addColorStop(0, 'rgba(2,6,23,0.00)')
  grad2.addColorStop(0.28, 'rgba(2,6,23,0.20)')
  grad2.addColorStop(0.5, 'rgba(2,6,23,0.32)')
  grad2.addColorStop(0.72, 'rgba(2,6,23,0.18)')
  grad2.addColorStop(1, 'rgba(2,6,23,0.00)')
  ctx.fillStyle = grad2
  ctx.fillRect(-size * 0.6, -4, size * 1.2, 8)

  // Fine filaments (adds realism)
  ctx.filter = 'blur(0px)'
  ctx.globalAlpha = 0.55
  for (let i = 0; i < 220; i++) {
    const y = (r() - 0.5) * 26
    const x0 = -size * (0.52 + r() * 0.06)
    const x1 = size * (0.52 + r() * 0.06)
    const w = 0.5 + r() * 1.6
    const a = 0.02 + r() * 0.08
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.bezierCurveTo(x0 * 0.3, y + (r() - 0.5) * 10, x1 * 0.3, y + (r() - 0.5) * 10, x1, y + (r() - 0.5) * 8)
    ctx.strokeStyle = `rgba(2,6,23,${a})`
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  ctx.restore()
  ctx.filter = 'none'
}

function drawDustLayer(ctx: CanvasRenderingContext2D, r: () => number, size: number) {
  ctx.clearRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'source-over'

  // Very subtle speckles — kept light to avoid “dirty paper”
  for (let i = 0; i < 1200; i++) {
    const x = r() * size
    const y = r() * size
    const s = r() < 0.92 ? 1 : 2
    const a = 0.008 + r() * 0.018
    ctx.fillStyle = `rgba(2,6,23,${a})`
    ctx.fillRect(x, y, s, s)
  }
}

function buildLayers(size: number): LayerBundle {
  return {
    ring: makeLayer(size, drawRingLayer, 2),
    disk: makeLayer(size, drawDiskLayer, 5),
    dust: makeLayer(size, drawDustLayer, 11),
  }
}

export function LightAccretionBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [reduceMotion, setReduceMotion] = useState(false)

  const isClient = typeof window !== 'undefined'
  const dpr = useMemo(() => (isClient ? Math.min(window.devicePixelRatio || 1, 2) : 1), [isClient])

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const onChange = () => setReduceMotion(Boolean(mq.matches))
    onChange()
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })!

    let raf = 0
    let timer: number | null = null
    let layers: LayerBundle | null = null
    let lastW = 0
    let lastH = 0

    const layerSize = 1400
    layers = buildLayers(layerSize)

    const resize = () => {
      const parent = canvas.parentElement
      const w = parent?.clientWidth ?? window.innerWidth
      const h = parent?.clientHeight ?? window.innerHeight
      if (w === lastW && h === lastH) return
      lastW = w
      lastH = h
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }

    resize()
    const ro = new ResizeObserver(() => resize())
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    const draw = (t: number) => {
      // If hidden (e.g. dark mode via display:none), don’t animate continuously.
      if (canvas.offsetParent === null) {
        if (timer == null) {
          timer = window.setTimeout(() => {
            timer = null
            raf = window.requestAnimationFrame(draw)
          }, 900)
        }
        return
      }

      const w = canvas.width
      const h = canvas.height
      if (w === 0 || h === 0 || !layers) return

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const time = t / 1000
      const cx = (w / dpr) / 2
      const cy = (h / dpr) / 2

      const cover = Math.max(w / dpr, h / dpr) * 1.18
      const s = cover / layerSize

      // Subtle “designer” motion: slow rotation + tiny breathing scale + shimmer
      const rot = reduceMotion ? -0.04 : Math.sin(time * 0.09) * 0.08 + time * 0.008
      const rot2 = reduceMotion ? 0 : -time * 0.014
      const breathe = reduceMotion ? 1 : 1 + Math.sin(time * 0.22) * 0.006
      const shimmer = reduceMotion ? 1 : 0.92 + (Math.sin(time * 0.7) + 1) * 0.04

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(rot)
      ctx.scale(s * breathe, s * breathe)
      ctx.globalAlpha = 0.55 * shimmer
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(layers.disk, -layerSize / 2, -layerSize / 2)
      ctx.restore()

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(rot2)
      ctx.scale(s, s)
      ctx.globalAlpha = 0.52
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(layers.ring, -layerSize / 2, -layerSize / 2)
      ctx.restore()

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(rot2 * 0.3)
      ctx.scale(s, s)
      ctx.globalAlpha = 0.33
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(layers.dust, -layerSize / 2, -layerSize / 2)
      ctx.restore()

      if (!reduceMotion) {
        raf = window.requestAnimationFrame(draw)
      }
    }

    raf = window.requestAnimationFrame(draw)

    return () => {
      ro.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
      if (timer != null) window.clearTimeout(timer)
    }
  }, [dpr, reduceMotion])

  return <canvas ref={canvasRef} className="ss-light-accretion-canvas" aria-hidden />
}

