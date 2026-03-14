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
  | { kind: 'ldtk_attachment'; attachmentId: string }
  | { kind: 'ldtk_url'; url: string }
  | { kind: 'tiled_attachment'; attachmentId: string }
  | { kind: 'procedural'; seed: string; generatorVersion: string }

export type RoomGameSnapshot = {
  roomConversationId: string
  /** Starship ID for resolving attachment access (e.g. LDtk maps). */
  starshipId: string
  at: string
  seed: string
  generatorVersion: string
  mapRef: RoomGameMapRef
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

