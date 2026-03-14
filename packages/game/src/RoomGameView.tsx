'use client'

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RoomGameActor, RoomGameActorsJoinLeave, RoomGameActorsPatch, RoomGameMap, RoomGameSnapshot } from '@/types'
import { useRoomGameStream } from '@/hooks/useRoomGameStream'
import { colorFromAppearanceKey, deriveRoomSeed } from '@/lib/appearance'
import { generateTopDownRoom } from '@/procgen/room'

type ActorById = Map<string, RoomGameActor>

function isRoomGameMap(v: unknown): v is RoomGameMap {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.gridSize === 'number' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number' &&
    typeof r.tilesetImageUrl === 'string' &&
    Array.isArray(r.layers) &&
    Array.isArray(r.collisions)
  )
}

function applySnapshot(s: RoomGameSnapshot): ActorById {
  const m: ActorById = new Map()
  for (const a of Array.isArray(s.actors) ? s.actors : []) {
    if (!a || typeof a.id !== 'string') continue
    m.set(a.id, a)
  }
  return m
}

function applyPatch(prev: ActorById, patch: RoomGameActorsPatch): ActorById {
  const next = new Map(prev)
  for (const p of Array.isArray(patch.patches) ? patch.patches : []) {
    const id = String(p?.id || '').trim()
    if (!id) continue
    const cur = next.get(id)
    if (!cur) continue
    next.set(id, {
      ...cur,
      ...(typeof p.x === 'number' ? { x: p.x } : null),
      ...(typeof p.y === 'number' ? { y: p.y } : null),
      ...('facing' in p ? { facing: p.facing ?? null } : null),
      ...('anim' in p ? { anim: p.anim ?? null } : null),
      ...('appearanceKey' in p ? { appearanceKey: p.appearanceKey ?? null } : null),
      ...('avatarAttachmentId' in p ? { avatarAttachmentId: p.avatarAttachmentId ?? null } : null),
      ...('label' in p ? { label: p.label ?? null } : null),
    })
  }
  return next
}

function applyJoin(prev: ActorById, evt: RoomGameActorsJoinLeave): ActorById {
  const next = new Map(prev)
  const a = evt.actor
  if (a && typeof a.id === 'string') next.set(a.id, a)
  return next
}

function applyLeave(prev: ActorById, evt: RoomGameActorsJoinLeave): ActorById {
  const next = new Map(prev)
  const a = evt.actor
  if (a && typeof a.id === 'string') next.delete(a.id)
  return next
}

export function RoomGameView(props: {
  roomConversationId: string
  enabled?: boolean
  getAuthToken?: () => Promise<string | null | undefined>
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const stageRef = useRef<Container | null>(null)
  const actorLayerRef = useRef<Container | null>(null)
  const tileLayerRef = useRef<Container | null>(null)
  const propLayerRef = useRef<Container | null>(null)
  const gridPxRef = useRef<number>(32)

  const [snapshot, setSnapshot] = useState<RoomGameSnapshot | null>(null)
  const [actorsById, setActorsById] = useState<ActorById>(() => new Map())
  const [pixiReady, setPixiReady] = useState<boolean>(false)
  const [mapRenderStatus, setMapRenderStatus] = useState<string>('map: (none)')

  const seed = useMemo(() => {
    const s = snapshot?.seed
    if (typeof s === 'string' && s.trim()) return s.trim()
    return deriveRoomSeed(props.roomConversationId, snapshot?.generatorVersion || 'v1')
  }, [props.roomConversationId, snapshot?.generatorVersion, snapshot?.seed])

  const { streamState } = useRoomGameStream({
    roomConversationId: props.roomConversationId,
    enabled: props.enabled ?? true,
    getAuthToken: props.getAuthToken,
    onSnapshot: (s) => {
      setSnapshot(s)
      setActorsById(applySnapshot(s))
    },
    onActorsPatch: (p) => setActorsById((prev) => applyPatch(prev, p)),
    onActorJoin: (e) => setActorsById((prev) => applyJoin(prev, e)),
    onActorLeave: (e) => setActorsById((prev) => applyLeave(prev, e)),
  })

  useEffect(() => {
    if (props.enabled === false) return
    const roomConversationId = String(props.roomConversationId || '').trim()
    if (!roomConversationId) return

    const pressed = new Set<string>()
    const inFlightRef = { current: false }

    const sendMove = async (dx: number, dy: number) => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      const token = props.getAuthToken ? await props.getAuthToken().catch(() => null) : null
      await fetch(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/game/input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : null),
        },
        body: JSON.stringify({ type: 'move', dx, dy }),
      }).catch(() => undefined)
      inFlightRef.current = false
    }

    const keyToDir = (k: string) => {
      if (k === 'ArrowUp' || k === 'w') return 'up'
      if (k === 'ArrowDown' || k === 's') return 'down'
      if (k === 'ArrowLeft' || k === 'a') return 'left'
      if (k === 'ArrowRight' || k === 'd') return 'right'
      return null
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const dir = keyToDir(e.key)
      if (!dir) return
      e.preventDefault()
      pressed.add(dir)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const dir = keyToDir(e.key)
      if (!dir) return
      e.preventDefault()
      pressed.delete(dir)
    }

    window.addEventListener('keydown', onKeyDown, { passive: false })
    window.addEventListener('keyup', onKeyUp, { passive: false })

    // Continuous movement: send small deltas while keys are held.
    const tickMs = 50
    const speedTilesPerSecond = 4
    const dt = tickMs / 1000
    const id = window.setInterval(() => {
      if (pressed.size === 0) return
      let dx = 0
      let dy = 0
      if (pressed.has('up')) dy -= 1
      if (pressed.has('down')) dy += 1
      if (pressed.has('left')) dx -= 1
      if (pressed.has('right')) dx += 1
      if (dx === 0 && dy === 0) return
      const mag = Math.hypot(dx, dy) || 1
      dx = (dx / mag) * speedTilesPerSecond * dt
      dy = (dy / mag) * speedTilesPerSecond * dt
      void sendMove(dx, dy)
    }, tickMs)

    return () => {
      window.clearInterval(id)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [props.enabled, props.getAuthToken, props.roomConversationId])

  // Mount Pixi app
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (appRef.current) return

    const app = new Application()
    appRef.current = app

    let disposed = false
    ;(async () => {
      await app.init({
        background: '#0b1020',
        antialias: true,
        resizeTo: el,
        resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
        autoDensity: true,
      })
      if (disposed) return
      el.appendChild(app.canvas)

      const stage = new Container()
      stageRef.current = stage
      app.stage.addChild(stage)

      const tileLayer = new Container()
      tileLayerRef.current = tileLayer
      stage.addChild(tileLayer)

      const propLayer = new Container()
      propLayerRef.current = propLayer
      stage.addChild(propLayer)

      // Background grid
      const bg = new Graphics()
      bg.alpha = 0.22
      stage.addChild(bg)

      const actorLayer = new Container()
      actorLayerRef.current = actorLayer
      stage.addChild(actorLayer)

      const drawBg = () => {
        const w = app.renderer.width
        const h = app.renderer.height
        bg.clear()
        bg.rect(0, 0, w, h)
        bg.fill({ color: 0x0b1020 })
        const cell = gridPxRef.current || 32
        bg.stroke({ width: 1, color: 0xffffff, alpha: 0.08 })
        for (let x = 0; x <= w; x += cell) {
          bg.moveTo(x, 0)
          bg.lineTo(x, h)
        }
        for (let y = 0; y <= h; y += cell) {
          bg.moveTo(0, y)
          bg.lineTo(w, y)
        }
        bg.stroke()
      }
      drawBg()
      app.renderer.on('resize', drawBg)

      // Signal that Pixi + layers are ready for rendering effects.
      setPixiReady(true)
    })()

    return () => {
      disposed = true
      setPixiReady(false)
      try {
        app.renderer.off('resize', () => undefined)
      } catch {
        // ignore
      }
      try {
        el.querySelector('canvas')?.remove()
      } catch {
        // ignore
      }
      try {
        app.destroy(true)
      } catch {
        // ignore
      }
      appRef.current = null
      stageRef.current = null
      actorLayerRef.current = null
      tileLayerRef.current = null
      propLayerRef.current = null
    }
  }, [])

  // Render map tiles
  useEffect(() => {
    if (!pixiReady) return
    const app = appRef.current
    const tileLayer = tileLayerRef.current
    const propLayer = propLayerRef.current
    if (!app || !tileLayer || !propLayer) return

    let cancelled = false

    const clearTileLayer = () => {
      try {
        tileLayer.removeChildren()
      } catch {
        // ignore
      }
    }

    const clearPropLayer = () => {
      try {
        propLayer.removeChildren()
      } catch {
        // ignore
      }
    }

    const renderOverlayGrid = (m: { width: number; height: number; gridSize: number; collisions?: number[] }) => {
      clearPropLayer()

      const g = new Graphics()
      const cell = m.gridSize
      const wPx = m.width * cell
      const hPx = m.height * cell

      // Collision shading (optional)
      const blocked = new Set<number>(Array.isArray(m.collisions) ? m.collisions : [])
      if (blocked.size > 0) {
        for (const i of blocked) {
          if (!(i >= 0 && i < m.width * m.height)) continue
          const x = i % m.width
          const y = Math.floor(i / m.width)
          g.rect(x * cell, y * cell, cell, cell)
          g.fill({ color: 0xef4444, alpha: 0.12 })
        }
      }

      // Grid lines (map-aligned)
      g.stroke({ width: 1, color: 0xffffff, alpha: 0.12 })
      for (let x = 0; x <= m.width; x++) {
        const px = x * cell
        g.moveTo(px, 0)
        g.lineTo(px, hPx)
      }
      for (let y = 0; y <= m.height; y++) {
        const py = y * cell
        g.moveTo(0, py)
        g.lineTo(wPx, py)
      }
      g.stroke()

      // Outer border
      g.stroke({ width: 2, color: 0xffffff, alpha: 0.22 })
      g.rect(0, 0, wPx, hPx)
      g.stroke()

      propLayer.addChild(g)
    }

    const renderProcedural = () => {
      const cell = gridPxRef.current || 32
      const tilesWide = Math.max(8, Math.ceil(app.renderer.width / cell))
      const tilesHigh = Math.max(8, Math.ceil(app.renderer.height / cell))
      const grid = generateTopDownRoom({ seed, width: tilesWide, height: tilesHigh })

      clearTileLayer()
      clearPropLayer()
      setMapRenderStatus(`map: procedural ${tilesWide}x${tilesHigh} cell:${cell}`)
      const g = new Graphics()
      for (let y = 0; y < grid.length; y++) {
        const row = grid[y]
        for (let x = 0; x < row.length; x++) {
          const t = row[x]
          const px = x * cell
          const py = y * cell
          if (t === 0) {
            g.rect(px, py, cell, cell)
            g.fill({ color: 0x0f172a, alpha: 1 })
          } else if (t === 1) {
            g.rect(px, py, cell, cell)
            g.fill({ color: 0x1f2937, alpha: 1 })
          } else {
            g.rect(px + 6, py + 6, cell - 12, cell - 12)
            g.fill({ color: 0x334155, alpha: 1 })
          }
        }
      }
      tileLayer.addChild(g)
    }

    const renderDebugGrid = (m: { width: number; height: number; gridSize: number; layers: Array<{ data: number[] }> }, reason: string) => {
      clearTileLayer()
      clearPropLayer()
      setMapRenderStatus(`map: debug (${reason}) ${m.width}x${m.height} cell:${m.gridSize}`)

      const g = new Graphics()
      g.alpha = 1
      for (let i = 0; i < m.width * m.height; i++) {
        const x = i % m.width
        const y = Math.floor(i / m.width)
        const gid = Number(m.layers?.[0]?.data?.[i] || 0)
        const px = x * m.gridSize
        const py = y * m.gridSize
        const isWall = gid === 1
        g.rect(px, py, m.gridSize, m.gridSize)
        g.fill({ color: isWall ? 0x475569 : 0x0f172a, alpha: 1 })
      }
      tileLayer.addChild(g)
    }

    const renderMap = async (m: RoomGameMap) => {
      clearTileLayer()

      const { width, height, gridSize, tilesetImageUrl, layers } = m
      if (!(width > 0 && height > 0 && gridSize > 0 && tilesetImageUrl)) {
        setMapRenderStatus('map: invalid (missing width/height/tilesetImageUrl)')
        return renderProcedural()
      }

      gridPxRef.current = gridSize

      // Map-aligned debug overlay grid + collision shading.
      renderOverlayGrid({ width, height, gridSize, collisions: Array.isArray(m.collisions) ? m.collisions : [] })

      setMapRenderStatus(`map: loading tileset ${tilesetImageUrl}`)
      let sheet: Texture
      try {
        sheet = (await Assets.load(tilesetImageUrl)) as Texture
      } catch {
        renderDebugGrid({ width, height, gridSize, layers }, `tileset load failed: ${tilesetImageUrl}`)
        return
      }
      if (cancelled) return

      setMapRenderStatus(`map: rendering ${width}x${height} layers:${layers.length} cell:${gridSize}`)
      const baseW = sheet.source?.width ?? sheet.width
      const cols = Math.max(1, Math.floor(Number(baseW) / gridSize) || 1)

      const mkSubTexture = (gid: number) => {
        const tileIndex = gid - 1
        const sx = (tileIndex % cols) * gridSize
        const sy = Math.floor(tileIndex / cols) * gridSize
        // Pixi v8: create sub-texture via TextureOptions { source, frame }
        return new Texture({ source: sheet.source, frame: new Rectangle(sx, sy, gridSize, gridSize) })
      }

      const textureCache = new Map<number, Texture>()

      for (const layer of layers) {
        if (cancelled) return
        const data = Array.isArray(layer?.data) ? (layer.data as unknown[]) : []
        if (data.length !== width * height) continue
        const layerContainer = new Container()
        tileLayer.addChild(layerContainer)

        for (let i = 0; i < data.length; i++) {
          const gid = Number(data[i] || 0)
          if (!(gid > 0)) continue
          let tex = textureCache.get(gid)
          if (!tex) {
            tex = mkSubTexture(gid)
            textureCache.set(gid, tex)
          }
          const x = i % width
          const y = Math.floor(i / width)
          const spr = new Sprite(tex)
          spr.x = x * gridSize
          spr.y = y * gridSize
          layerContainer.addChild(spr)
        }
      }
    }

    const map = snapshot?.map
    if (isRoomGameMap(map)) {
      void renderMap(map).catch(() => {
        setMapRenderStatus('map: render failed (exception), falling back to procedural')
        renderProcedural()
      })
      return () => {
        cancelled = true
        clearTileLayer()
        clearPropLayer()
      }
    }

    renderProcedural()
    app.renderer.on('resize', renderProcedural)
    return () => {
      cancelled = true
      try {
        app.renderer.off('resize', renderProcedural)
      } catch {
        // ignore
      }
    }
  }, [pixiReady, seed, snapshot?.map])

  // Render actors (simple tokens for now; sprite assets will replace these)
  useEffect(() => {
    if (!pixiReady) return
    const layer = actorLayerRef.current
    const app = appRef.current
    if (!layer || !app) return

    layer.removeChildren()

    const actors = Array.from(actorsById.values())
    for (const a of actors) {
      const g = new Graphics()
      const css = colorFromAppearanceKey(a.appearanceKey || a.avatarAttachmentId || a.id)
      // Pixi v8 accepts CSS in fill? use numeric conversion fallback
      const color = Number.parseInt(css.replace('#', ''), 16)
      const radius = 10
      g.circle(0, 0, radius)
      g.fill({ color: Number.isFinite(color) ? color : 0x64748b, alpha: 0.95 })
      const cell = gridPxRef.current || 32
      // Center actors within the grid cell.
      g.x = Math.round(((a.x || 0) + 0.5) * cell)
      g.y = Math.round(((a.y || 0) + 0.5) * cell)

      const label = String(a.label || (a.kind === 'agent' ? 'Agent' : 'User'))
      const t = new Text({
        text: label,
        style: { fontFamily: 'monospace', fontSize: 11, fill: 0xe2e8f0 },
      })
      t.anchor.set(0.5, 0)
      t.x = g.x
      t.y = g.y + radius + 4

      layer.addChild(g)
      layer.addChild(t)
    }
  }, [pixiReady, actorsById, seed])

  const statusLine = useMemo(() => {
    if (streamState.status === 'connected') return 'Connected'
    if (streamState.status === 'connecting') return 'Connecting…'
    if (streamState.status === 'error') return `Error: ${streamState.message}`
    return 'Idle'
  }, [streamState])

  return (
    <div className="relative h-full w-full min-h-0">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute left-3 top-3 z-10 rounded-md bg-black/40 backdrop-blur px-2 py-1 text-xs text-white font-mono">
        RoomGame · {statusLine} · {mapRenderStatus} · seed:{seed.slice(0, 6)}
      </div>
    </div>
  )
}

