import type { RoomDefinition } from './types';
import { compact, dumpYaml, loadYaml, requireString } from './yaml';

/**
 * Pure codec between a {@link RoomDefinition} and its `.autopilot/rooms/<slug>.yaml`
 * file. Assembling the definition from the index (which reads several composition
 * repos) lives in roomAssembler; this module only serializes/parses.
 */

export function roomFilename(slug: string): string {
  return `${slug}.yaml`;
}

export function roomSlugFromFilename(filename: string): string {
  return filename.replace(/\.yaml$/i, '');
}

function stringArray(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new Error(`room definition field '${key}' must be an array of strings`);
  }
  return v as string[];
}

export function serializeRoomDefinition(def: RoomDefinition): string {
  return dumpYaml(
    compact({
      conversationId: def.conversationId,
      slug: def.slug,
      name: def.name,
      isPrivate: def.isPrivate,
      topic: def.topic || undefined,
      managerAgentId: def.managerAgentId || undefined,
      provisionedByBundle: def.provisionedByBundle || undefined,
      agents: def.agents.length > 0 ? def.agents : undefined,
      tables: def.tables.length > 0 ? def.tables : undefined,
      views: def.views.length > 0 ? def.views : undefined,
      taskBoards: def.taskBoards.length > 0 ? def.taskBoards : undefined,
      docs: def.docs.length > 0 ? def.docs : undefined,
    })
  );
}

export function parseRoom(raw: string): RoomDefinition {
  const data = loadYaml(raw);
  return {
    conversationId: requireString(data, 'conversationId', 'room'),
    slug: requireString(data, 'slug', 'room'),
    name: requireString(data, 'name', 'room'),
    isPrivate: typeof data.isPrivate === 'boolean' ? data.isPrivate : false,
    ...(typeof data.topic === 'string' && data.topic ? { topic: data.topic } : {}),
    ...(typeof data.managerAgentId === 'string' && data.managerAgentId ? { managerAgentId: data.managerAgentId } : {}),
    ...(typeof data.provisionedByBundle === 'string' && data.provisionedByBundle
      ? { provisionedByBundle: data.provisionedByBundle }
      : {}),
    agents: stringArray(data, 'agents'),
    tables: stringArray(data, 'tables'),
    views: stringArray(data, 'views'),
    taskBoards: stringArray(data, 'taskBoards'),
    docs: stringArray(data, 'docs'),
  };
}
