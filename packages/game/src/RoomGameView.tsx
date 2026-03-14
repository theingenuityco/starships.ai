/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RoomGameActor, RoomGameActorsJoinLeave, RoomGameActorsPatch, RoomGameSnapshot } from '@/types'
import { useRoomGameStream } from '@/hooks/useRoomGameStream'
import { colorFromAppearanceKey, deriveRoomSeed } from '@/lib/appearance'
import { generateTopDownRoom } from '@/procgen/room'

type ActorById = Map<string, RoomGameActor>

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
    const id = String((p as any)?.id || '').trim()
    if (!id) continue
    const cur = next.get(id)
    if (!cur) continue
    next.set(id, {
      ...cur,
      ...(typeof (p as any).x === 'number' ? { x: (p as any).x } : null),
      ...(typeof (p as any).y === 'number' ? { y: (p as any).y } : null),
      ...('facing' in (p as any) ? { facing: (p as any).facing ?? null } : null),
      ...('anim' in (p as any) ? { anim: (p as any).anim ?? null } : null),
      ...('appearanceKey' in (p as any) ? { appearanceKey: (p as any).appearanceKey ?? null } : null),
      ...('avatarAttachmentId' in (p as any) ? { avatarAttachmentId: (p as any).avatarAttachmentId ?? null } : null),
      ...('label' in (p as any) ? { label: (p as any).label ?? null } : null),
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
  const gridPxRef = useRef<number>(32)

  const [snapshot, setSnapshot] = useState<RoomGameSnapshot | null>(null)
  const [actorsById, setActorsById] = useState<ActorById>(() => new Map())

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

  const lastMoveAtRef = useRef<number>(0)
  useEffect(() => {
    if (props.enabled === false) return
    const roomConversationId = String(props.roomConversationId || '').trim()
    if (!roomConversationId) return

    const sendMove = async (dx: number, dy: number) => {
      const now = Date.now()
      if (now - lastMoveAtRef.current < 90) return // ~11Hz max
      lastMoveAtRef.current = now
      const token = props.getAuthToken ? await props.getAuthToken().catch(() => null) : null
      await fetch(`/api/v1/rooms/${encodeURIComponent(roomConversationId)}/game/input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : null),
        } as any,
        body: JSON.stringify({ type: 'move', dx, dy }),
      }).catch(() => undefined)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const key = e.key
      if (key === 'ArrowUp' || key === 'w') {
        e.preventDefault()
        void sendMove(0, -1)
      } else if (key === 'ArrowDown' || key === 's') {
        e.preventDefault()
        void sendMove(0, 1)
      } else if (key === 'ArrowLeft' || key === 'a') {
        e.preventDefault()
        void sendMove(-1, 0)
      } else if (key === 'ArrowRight' || key === 'd') {
        e.preventDefault()
        void sendMove(1, 0)
      }
    }

    window.addEventListener('keydown', onKeyDown, { passive: false })
    return () => window.removeEventListener('keydown', onKeyDown)
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
    })()

    return () => {
      disposed = true
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
    }
  }, [])

  // Render map tiles
  useEffect(() => {
    const app = appRef.current
    const tileLayer = tileLayerRef.current
    if (!app || !tileLayer) return

    let cancelled = false

    const clearTileLayer = () => {
      try {
        tileLayer.removeChildren()
      } catch {
        // ignore
      }
    }

    const renderProcedural = () => {
      const cell = gridPxRef.current || 32
      const tilesWide = Math.max(8, Math.ceil(app.renderer.width / cell))
      const tilesHigh = Math.max(8, Math.ceil(app.renderer.height / cell))
      const grid = generateTopDownRoom({ seed, width: tilesWide, height: tilesHigh })

      clearTileLayer()
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

    const resolveTileImageUrl = (args: { relPath: string | null | undefined; ldtkUrl?: string | null }) => {
      const raw = String(args.relPath || '').trim()
      if (!raw) return '/public-assets/modern-office/Modern_Office_32x32.png'
      if (/^https?:\/\//i.test(raw)) return raw
      if (raw.startsWith('/')) return raw

      // Resolve relative to the LDtk file location when possible.
      const base = String(args.ldtkUrl || '').trim()
      if (base.startsWith('/')) {
        const baseDir = base.split('?')[0].split('#')[0].split('/').slice(0, -1).join('/') || ''
        const cleaned = raw.replace(/\\/g, '/').replace(/^\.?\//, '')
        return `${baseDir}/${cleaned}`
      }

      // Backward-compatible dev fallback for files stored in repo root Modern_Office_Revamped_v1.2
      let p = raw.replace(/\\/g, '/').replace(/^\.?\//, '')
      const lower = p.toLowerCase()
      const marker = 'modern_office_revamped_v1.2/'
      const idx = lower.indexOf(marker)
      if (idx >= 0) p = p.slice(idx + marker.length)
      return `/public-assets/modern-office/${p}`
    }

    const renderLdtkFromJson = async (ldtk: any, opts?: { ldtkUrl?: string | null }) => {
      clearTileLayer()
      if (!ldtk || typeof ldtk !== 'object') {
        renderProcedural()
        return
      }

      const level = Array.isArray((ldtk as any).levels) ? (ldtk as any).levels[0] : null
      const layers = level && Array.isArray((level as any).layerInstances) ? ((level as any).layerInstances as any[]) : []
      const defsTilesets =
        ldtk && (ldtk as any).defs && Array.isArray((ldtk as any).defs.tilesets) ? ((ldtk as any).defs.tilesets as any[]) : []
      const tilesetByUid = new Map<number, any>()
      for (const ts of defsTilesets) {
        const uid = typeof ts?.uid === 'number' ? ts.uid : null
        if (uid == null) continue
        tilesetByUid.set(uid, ts)
      }

      const gridSizeFromLayer = layers.find((l) => typeof (l as any)?.__gridSize === 'number')?.__gridSize
      const gridSize = typeof gridSizeFromLayer === 'number' && gridSizeFromLayer > 0 ? gridSizeFromLayer : 32
      gridPxRef.current = gridSize

      // Collect tileset UIDs used by layers/tiles.
      const usedTilesetUids = new Set<number>()
      for (const l of layers) {
        const uid = typeof (l as any)?.__tilesetDefUid === 'number' ? (l as any).__tilesetDefUid : null
        if (uid != null) usedTilesetUids.add(uid)
        for (const t of ([] as any[]).concat((l as any)?.gridTiles ?? [], (l as any)?.autoLayerTiles ?? [])) {
          const tuid = typeof (t as any)?.t === 'number' ? (t as any).t : typeof (t as any)?.tilesetUid === 'number' ? (t as any).tilesetUid : null
          if (tuid != null) usedTilesetUids.add(tuid)
        }
      }

      const sheetByUid = new Map<number, Texture>()
      for (const uid of usedTilesetUids) {
        const def = tilesetByUid.get(uid)
        const imgUrl = resolveTileImageUrl({ relPath: def?.relPath, ldtkUrl: opts?.ldtkUrl ?? null })
        try {
          const tex = (await Assets.load(imgUrl)) as unknown as Texture
          sheetByUid.set(uid, tex)
        } catch {
          // ignore; missing tilesets will be skipped
        }
      }

      const mkSubTexture = (sheet: Texture, sx: number, sy: number, size: number) => {
        const base = (sheet as any).baseTexture ?? (sheet as any).source ?? sheet
        return new (Texture as any)(base, new Rectangle(sx, sy, size, size)) as Texture
      }

      // Render each layer into its own container (keep LDtk order).
      for (const l of layers) {
        if (cancelled) return
        const layerContainer = new Container()
        tileLayer.addChild(layerContainer)

        const tiles: any[] = ([] as any[]).concat((l as any)?.autoLayerTiles ?? [], (l as any)?.gridTiles ?? [])
        const fallbackTilesetUid = typeof (l as any)?.__tilesetDefUid === 'number' ? (l as any).__tilesetDefUid : null

        for (const tile of tiles) {
          if (cancelled) return
          const px = Array.isArray(tile?.px) ? tile.px : null
          const src = Array.isArray(tile?.src) ? tile.src : null
          if (!px || px.length < 2 || !src || src.length < 2) continue

          // In standard LDtk exports, `tile.t` is a *tileId* (not tileset UID).
          // Tileset UID comes from the layer instance (`__tilesetDefUid`) or an override.
          const uid = typeof tile?.tilesetUid === 'number' ? tile.tilesetUid : fallbackTilesetUid
          if (typeof uid !== 'number') continue
          const sheet = sheetByUid.get(uid)
          if (!sheet) continue

          const tex = mkSubTexture(sheet, Number(src[0]) || 0, Number(src[1]) || 0, gridSize)
          const spr = new Sprite(tex)
          spr.x = Math.round(Number(px[0]) || 0)
          spr.y = Math.round(Number(px[1]) || 0)

          const f = typeof tile?.f === 'number' ? tile.f : 0
          // LDtk flip flags: bit 0 = X, bit 1 = Y
          if (f & 1) {
            spr.scale.x = -1
            spr.x += gridSize
          }
          if (f & 2) {
            spr.scale.y = -1
            spr.y += gridSize
          }
          const a = typeof tile?.a === 'number' ? tile.a : null
          if (typeof a === 'number') spr.alpha = a > 1 ? Math.max(0, Math.min(1, a / 255)) : Math.max(0, Math.min(1, a))

          layerContainer.addChild(spr)
        }
      }
    }

    const mapRef = snapshot?.mapRef as any
    const isLdtkAttachment = mapRef && mapRef.kind === 'ldtk_attachment' && typeof mapRef.attachmentId === 'string' && mapRef.attachmentId.trim()
    const isLdtkUrl = mapRef && mapRef.kind === 'ldtk_url' && typeof mapRef.url === 'string' && mapRef.url.trim()
    const starshipId = snapshot?.starshipId

    if (isLdtkUrl) {
      const ldtkUrl = String(mapRef.url).trim()
      void fetch(ldtkUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => renderLdtkFromJson(json, { ldtkUrl }))
        .catch(() => renderProcedural())
      return () => {
        cancelled = true
        clearTileLayer()
      }
    }

    if (isLdtkAttachment && typeof starshipId === 'string' && starshipId.trim()) {
      void (async () => {
        const token = props.getAuthToken ? await props.getAuthToken().catch(() => null) : null
        const url = `/api/v1/attachments/${encodeURIComponent(String(mapRef.attachmentId).trim())}/preview?starshipId=${encodeURIComponent(starshipId.trim())}`
        const resp = await fetch(url, { method: 'GET', headers: token ? ({ Authorization: `Bearer ${token}` } as any) : undefined }).catch(
          () => null
        )
        if (!resp || !resp.ok) return renderProcedural()
        const txt = await resp.text().catch(() => '')
        const json = txt ? JSON.parse(txt) : null
        return renderLdtkFromJson(json, { ldtkUrl: null })
      })().catch(() => renderProcedural())
      return () => {
        cancelled = true
        clearTileLayer()
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
  }, [props.getAuthToken, seed, snapshot?.mapRef, snapshot?.starshipId])

  // Render actors (simple tokens for now; sprite assets will replace these)
  useEffect(() => {
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
      g.x = Math.round((a.x || 0) * cell + cell)
      g.y = Math.round((a.y || 0) * cell + cell)

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
  }, [actorsById, seed])

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
        RoomGame · {statusLine} · seed:{seed.slice(0, 6)}
      </div>
    </div>
  )
}

