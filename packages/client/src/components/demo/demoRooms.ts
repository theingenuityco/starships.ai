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

/**
 * Merge the demo rooms into a real room list, de-duped by slug. Real rooms win
 * (they carry real conversationIds), so a starship that already has these rooms
 * navigates normally; missing ones are filled in by the mocks.
 */
export function mergeDemoRooms(real: RoomModel[]): RoomModel[] {
  const present = new Set(real.map((r) => String(r?.slug ?? '').trim().toLowerCase()).filter(Boolean))
  const missing = DEMO_ROOMS.filter((r) => !present.has(r.slug.toLowerCase()))
  return [...real, ...missing]
}

/** A minimal conversation shape the sidebar's nested list renders. */
export type DemoConversation = { id: string; title: string; updatedAt: string; createdAt: string }

// One recent thread per demo room, so the spotlighted room shows a real-looking
// nested conversation for the "camera" to land on. Keyed by the room's synthetic
// conversationId so the nested list can look them up without a network call.
const DEMO_ROOM_CONVERSATIONS: Record<string, DemoConversation[]> = {
  [DEMO_ROOM_CONVERSATION_IDS.support]: [
    { id: 'demo-conv-support-1042', title: 'Login button unresponsive on mobile', updatedAt: DEMO_TS, createdAt: DEMO_TS },
  ],
  [DEMO_ROOM_CONVERSATION_IDS.engineering]: [
    { id: 'demo-conv-eng-432', title: 'Fix mobile sign-in button', updatedAt: DEMO_TS, createdAt: DEMO_TS },
  ],
  [DEMO_ROOM_CONVERSATION_IDS.growth]: [
    { id: 'demo-conv-growth-q2', title: 'Q2 outbound pipeline', updatedAt: DEMO_TS, createdAt: DEMO_TS },
  ],
}

/** Returns the mock recent conversations for a demo room, or null if not a demo room. */
export function demoRoomConversations(roomConversationId: string): DemoConversation[] | null {
  return DEMO_ROOM_CONVERSATIONS[roomConversationId] ?? null
}
