/**
 * Registry of room setup handlers, keyed by the room's `provisionedByBundle` tag.
 * Rooms whose bundle tag has no entry simply have no setup process.
 */

import type { RoomSetupHandler } from './types';
import { engineeringSetupHandler } from './handlers/engineering';

const handlers: RoomSetupHandler[] = [engineeringSetupHandler];

export const roomSetupRegistry: Record<string, RoomSetupHandler> = Object.fromEntries(
  handlers.map((h) => [h.bundleTag, h])
);

/**
 * Resolve the setup handler for a room. Prefers the stable `provisionedByBundle` tag,
 * falling back to the room slug (for seeded rooms that predate the tag). Null if none.
 */
export function findHandlerForRoom(room: { provisionedByBundle?: string | null; slug?: string | null }): RoomSetupHandler | null {
  const tag = String(room.provisionedByBundle || '').trim();
  if (tag && roomSetupRegistry[tag]) return roomSetupRegistry[tag];
  const slug = String(room.slug || '').trim().toLowerCase();
  if (slug) {
    const bySlug = handlers.find((h) => (h.roomSlugs ?? []).some((s) => s.toLowerCase() === slug));
    if (bySlug) return bySlug;
  }
  return null;
}
