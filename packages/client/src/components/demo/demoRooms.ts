/**
 * demoRooms — client-side MOCK rooms for the hero-video demo.
 *
 * The founder-video shoot tours three rooms in the sidebar (Support, Engineering,
 * Growth) alongside Mission Control. Rather than seeding real DB rows, we inject
 * these mock rooms into the sidebar whenever the demo clock is active. They are
 * never persisted and never sent to the server: they exist only to give the
 * sidebar something to render and the spotlight something to highlight.
 *
 * Slugs mirror what the real room bundles produce, so the demo spotlight map in
 * `RoomSidebarList` (support / engineering / growth → these slugs) lights up the
 * right row on each beat. `conversationId` is a stable synthetic id so the
 * sidebar's nested-conversation highlight and any `/dashboard` navigation have a
 * value to key on. Inert for real users: only merged in when `demoActive`.
 */

import type { RoomModel } from '@starships/protocol'

const DEMO_STARSHIP_ID = 'demo-starship'
const DEMO_TS = '2026-01-01T00:00:00.000Z'

/** Synthetic conversation ids for the three demo rooms (used as React keys / route segments). */
export const DEMO_ROOM_CONVERSATION_IDS = {
  support: 'demo-room-support',
  engineering: 'demo-room-engineering',
  growth: 'demo-room-growth',
} as const

function room(slug: string, name: string, conversationId: string, provisionedByBundle: string): RoomModel {
  return {
    slug,
    name,
    isPrivate: false,
    topic: null,
    conversationId,
    starshipId: DEMO_STARSHIP_ID,
    managerAgentId: null,
    managerAgentHeartbeatAt: null,
    provisionedByBundle,
    createdAt: DEMO_TS,
    updatedAt: DEMO_TS,
  }
}

/** The three rooms the VO tours, in sidebar order. */
export const DEMO_ROOMS: RoomModel[] = [
  room('support', 'Support', DEMO_ROOM_CONVERSATION_IDS.support, 'support'),
  room('engineering', 'Engineering', DEMO_ROOM_CONVERSATION_IDS.engineering, 'engineering'),
  room('growth', 'Growth', DEMO_ROOM_CONVERSATION_IDS.growth, 'lead-generation'),
]

const DEMO_ROOM_CONVERSATION_ID_SET: ReadonlySet<string> = new Set(Object.values(DEMO_ROOM_CONVERSATION_IDS))

/** Is this synthetic conversation id one of the demo rooms? Used to bypass real-data gates. */
export function isDemoRoomConversationId(conversationId: string): boolean {
  return DEMO_ROOM_CONVERSATION_ID_SET.has(String(conversationId || '').trim())
}
