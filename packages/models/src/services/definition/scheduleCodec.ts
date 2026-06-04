import type { ScheduleModel } from '@starships/protocol';
import type { ScheduleDefinition } from './types';
import { compact, dumpYaml, loadYaml, requireString } from './yaml';

/**
 * Codec between a {@link ScheduleModel} (index row) and its
 * `.starship/schedules/<id>.yaml` file. Authored fields only; execution state
 * (nextRunAt/runCount/lastRun*) and ownerUserId are index-only and reconciled,
 * not authored. Schedules have no slug, so the immutable id is the filename.
 */

export function scheduleFilename(id: string): string {
  return `${id}.yaml`;
}

export function scheduleIdFromFilename(filename: string): string {
  return filename.replace(/\.yaml$/i, '');
}

export function scheduleModelToDefinition(schedule: ScheduleModel): ScheduleDefinition {
  return {
    id: schedule.id,
    agentId: schedule.agentId,
    prompt: schedule.prompt,
    cronExpression: schedule.cronExpression,
    timezone: schedule.timezone,
    isActive: schedule.isActive,
    isRecurring: schedule.isRecurring,
    ...(schedule.endsAt ? { endsAt: schedule.endsAt } : {}),
    ...(typeof schedule.maxOccurrences === 'number' ? { maxOccurrences: schedule.maxOccurrences } : {}),
  };
}

export function serializeScheduleDefinition(def: ScheduleDefinition): string {
  return dumpYaml(
    compact({
      id: def.id,
      agentId: def.agentId,
      prompt: def.prompt,
      cronExpression: def.cronExpression,
      timezone: def.timezone,
      isActive: def.isActive,
      isRecurring: def.isRecurring,
      endsAt: def.endsAt ?? undefined,
      maxOccurrences: def.maxOccurrences ?? undefined,
    })
  );
}

export function serializeSchedule(schedule: ScheduleModel): string {
  return serializeScheduleDefinition(scheduleModelToDefinition(schedule));
}

export function parseSchedule(raw: string): ScheduleDefinition {
  const data = loadYaml(raw);
  const numberOrNull = (key: string): number | null | undefined => {
    const v = data[key];
    if (v === undefined) return undefined;
    if (v === null) return null;
    const n = Number(v);
    if (Number.isNaN(n)) throw new Error(`schedule definition field '${key}' must be a number`);
    return n;
  };
  return compact({
    id: requireString(data, 'id', 'schedule'),
    agentId: requireString(data, 'agentId', 'schedule'),
    prompt: requireString(data, 'prompt', 'schedule'),
    cronExpression: requireString(data, 'cronExpression', 'schedule'),
    timezone: requireString(data, 'timezone', 'schedule'),
    isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
    isRecurring: typeof data.isRecurring === 'boolean' ? data.isRecurring : false,
    endsAt: typeof data.endsAt === 'string' ? data.endsAt : undefined,
    maxOccurrences: numberOrNull('maxOccurrences') ?? undefined,
  }) as ScheduleDefinition;
}
