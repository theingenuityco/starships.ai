import { Client } from '@notionhq/client';
import type { Lead } from './mailer';

function readEnv(): { client: Client; databaseId: string } | null {
  const apiKey = process.env.LANDING_NOTION_API_KEY;
  const databaseId = process.env.LANDING_NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    return null;
  }

  return { client: new Client({ auth: apiKey }), databaseId };
}

export async function appendLeadToNotion(lead: Lead): Promise<void> {
  const env = readEnv();

  if (!env) {
    console.warn('[landing/notion] LANDING_NOTION_API_KEY or LANDING_NOTION_DATABASE_ID not set — skipping');
    return;
  }

  await env.client.pages.create({
    parent: { database_id: env.databaseId },
    properties: {
      Name: { title: [{ text: { content: lead.name } }] },
      Email: { email: lead.email },
      Website: { url: lead.website || null },
      Room: { select: lead.room ? { name: lead.room } : null },
      Message: { rich_text: [{ text: { content: lead.message || '' } }] },
      Source: { rich_text: [{ text: { content: lead.source || '' } }] },
      'Submitted At': { date: { start: new Date().toISOString() } },
    },
  });
}
