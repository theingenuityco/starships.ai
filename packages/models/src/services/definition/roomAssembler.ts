import { RoomRepository } from '@/repositories/RoomRepository';
import { ConversationParticipantRepository } from '@/repositories/ConversationParticipantRepository';
import { RoomTablesRepository } from '@/repositories/RoomTablesRepository';
import { RoomViewsRepository } from '@/repositories/RoomViewsRepository';
import { RoomTaskBoardsRepository } from '@/repositories/RoomTaskBoardsRepository';
import { RoomDocsRepository } from '@/repositories/RoomDocsRepository';
import type { RoomDefinition } from './types';

/**
 * Assemble the full authored definition of a room from the index: metadata +
 * agent participants + the four ordered pin lists. Shared by the reconciler,
 * the backfill, and the server-side mirror so they serialize identically.
 * Returns null if the room (conversation) does not exist.
 */
export interface RoomAssemblerRepos {
  rooms?: RoomRepository;
  participants?: ConversationParticipantRepository;
  tables?: RoomTablesRepository;
  views?: RoomViewsRepository;
  taskBoards?: RoomTaskBoardsRepository;
  docs?: RoomDocsRepository;
}

export async function assembleRoomDefinition(conversationId: string, repos?: RoomAssemblerRepos): Promise<RoomDefinition | null> {
  const roomRepo = repos?.rooms ?? new RoomRepository();
  const participantRepo = repos?.participants ?? new ConversationParticipantRepository();
  const tableRepo = repos?.tables ?? new RoomTablesRepository();
  const viewRepo = repos?.views ?? new RoomViewsRepository();
  const taskBoardRepo = repos?.taskBoards ?? new RoomTaskBoardsRepository();
  const docRepo = repos?.docs ?? new RoomDocsRepository();

  const room = await roomRepo.findByConversationId(conversationId);
  if (!room) return null;

  const [agents, tables, views, taskBoards, docs] = await Promise.all([
    participantRepo.listAgentIdsByConversation(conversationId),
    tableRepo.list(conversationId),
    viewRepo.list(conversationId),
    taskBoardRepo.list(conversationId),
    docRepo.list(conversationId),
  ]);

  return {
    conversationId: room.conversationId,
    slug: room.slug,
    name: room.name,
    isPrivate: room.isPrivate,
    ...(room.topic ? { topic: room.topic } : {}),
    ...(room.managerAgentId ? { managerAgentId: room.managerAgentId } : {}),
    ...(room.provisionedByBundle ? { provisionedByBundle: room.provisionedByBundle } : {}),
    agents,
    tables: tables.map((t) => t.tableId),
    views: views.map((v) => v.viewId),
    taskBoards: taskBoards.map((b) => b.boardId),
    docs: docs.map((d) => d.docId),
  };
}
