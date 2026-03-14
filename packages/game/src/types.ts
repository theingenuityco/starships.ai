export type RoomGameFacing = 'up' | 'down' | 'left' | 'right'

export type RoomGameActorKind = 'user' | 'agent'

export type RoomGameActor = {
  id: string
  kind: RoomGameActorKind
  label?: string | null
  avatarAttachmentId?: string | null
  appearanceKey?: string | null
  x: number
  y: number
  facing?: RoomGameFacing | null
  anim?: string | null
}

export type RoomGameMapRef =
  | { kind: 'none' }
  | { kind: 'procedural'; seed: string; generatorVersion: string }
  | { kind: 'dynamic_office'; theme?: 'default' | 'shadowless' | 'black_shadow'; density?: number }

export type RoomGameMapLayer = {
  name: string
  /** Tiled GIDs (0 = empty). length = width*height */
  data: number[]
}

export type RoomGameMap = {
  gridSize: number
  width: number
  height: number
  tilesetImageUrl: string
  layers: RoomGameMapLayer[]
  /** Cell indices blocked (y*width + x). */
  collisions: number[]
}

export type RoomGameSnapshot = {
  roomConversationId: string
  /** Starship ID for resolving attachment access (e.g. LDtk maps). */
  starshipId: string
  at: string
  seed: string
  generatorVersion: string
  mapRef: RoomGameMapRef
  map?: RoomGameMap
  actors: RoomGameActor[]
}

export type RoomGameActorsPatch = {
  roomConversationId: string
  at: string
  patches: Array<
    {
      id: string
      x?: number
      y?: number
      facing?: RoomGameFacing | null
      anim?: string | null
      appearanceKey?: string | null
      avatarAttachmentId?: string | null
      label?: string | null
    }
  >
}

export type RoomGameActorsJoinLeave = {
  roomConversationId: string
  at: string
  actor: RoomGameActor
}

export type RoomGameFxEvent = {
  roomConversationId: string
  at: string
  kind: string
  payload?: Record<string, unknown>
}

export type RoomGameStreamEvent =
  | { type: 'snapshot'; data: RoomGameSnapshot }
  | { type: 'actors.patch'; data: RoomGameActorsPatch }
  | { type: 'actors.join'; data: RoomGameActorsJoinLeave }
  | { type: 'actors.leave'; data: RoomGameActorsJoinLeave }
  | { type: 'fx'; data: RoomGameFxEvent }

