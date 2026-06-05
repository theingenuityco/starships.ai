import {
  RoomRepository,
  StarshipDefinitionStore,
  assembleRoomDefinition,
  serializeRoomDefinition,
  roomFilename,
} from '@starships/models';
import { getEnvConfig } from '@starships/env';

/**
 * Mirror a room's full definition (metadata + composition) to its
 * `.autopilot/rooms/<slug>.yaml` file. Rooms have no service seam and ~17
 * mutation endpoints, so this best-effort, flag-gated helper recomputes the
 * whole definition from the index and rewrites the file after a mutation.
 *
 * Best-effort by design: a filesystem failure must never break a room mutation,
 * so all errors are swallowed (logged). Reconcile (file -> index) remains the
 * authoritative direction; this keeps files fresh so a full reconcile is safe.
 */
export async function mirrorRoomToFile(conversationId: string): Promise<void> {
  if (getEnvConfig().STARSHIP_FS_AUTHORITY !== true) return;
  try {
    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(conversationId);
    if (!room) return;
    const def = await assembleRoomDefinition(conversationId, { rooms: roomRepo });
    if (!def) return;
    const store = new StarshipDefinitionStore();
    await store.ensureProvisioned(room.starshipId);
    await store.write(room.starshipId, 'rooms', roomFilename(room.slug), serializeRoomDefinition(def));
  } catch (error) {
    console.warn(`[RoomDefinitionMirror] failed to mirror room ${conversationId}:`, error instanceof Error ? error.message : error);
  }
}
