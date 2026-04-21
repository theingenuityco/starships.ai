import type { Client } from 'pg';

// Migration 021 originally backfilled Aria agents from agent_templates.
// The template system has been removed (migration 183); this migration is now a no-op.
export async function up(_client: Client): Promise<void> {}

export async function down(_client: Client): Promise<void> {}
