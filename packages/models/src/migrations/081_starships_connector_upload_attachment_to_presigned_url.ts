type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

/**
 * Migration 081: Add upload-attachment-to-presigned-url endpoint to Starships connector
 *
 * Adds a connector_action endpoint for:
 * POST /uploads/presigned-url
 *
 * This allows workflows/tools to upload an existing Starships attachment (stored in S3)
 * to an external presigned URL by passing:
 * - attachmentId (Starships attachment id)
 * - presignedUrl (external URL)
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);

    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const row = rows[0];
    const endpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    const newEndpoint: Endpoint = {
      name: 'upload-attachment-to-presigned-url',
      description: 'Upload a Starships attachment to an external presigned URL',
      method: 'POST',
      path: '/uploads/presigned-url',
      parameters: {
        type: 'object',
        required: ['attachmentId', 'presignedUrl', 'bodyMode'],
        properties: {
          starshipId: { type: 'string' },
          attachmentId: { type: 'string' },
          presignedUrl: { type: 'string' },
          method: { type: 'string', enum: ['PUT', 'POST'] },
          bodyMode: { type: 'string', enum: ['raw', 'multipart'] },
          contentType: { type: 'string' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          fields: { type: 'object', additionalProperties: { type: 'string' } },
          fileFieldName: { type: 'string' },
        },
        additionalProperties: false,
      },
      mapping: {
        body: {
          starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          attachmentId: '{{ String(args.attachmentId ?? "") }}',
          presignedUrl: '{{ String(args.presignedUrl ?? "") }}',
          method: '{{ String(args.method ?? "PUT") }}',
          bodyMode: '{{ args.bodyMode }}',
          contentType: '{{ args.contentType }}',
          headers: '{{ args.headers }}',
          fields: '{{ args.fields }}',
          fileFieldName: '{{ args.fileFieldName }}',
        },
      },
      requestStyle: 'json',
      timeoutMs: 60000,
    };

    const existingIndex = endpoints.findIndex((e) => e?.name === newEndpoint.name);
    const nextEndpoints =
      existingIndex >= 0 ? endpoints.map((e, idx) => (idx === existingIndex ? newEndpoint : e)) : [...endpoints, newEndpoint];

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [
      JSON.stringify(nextEndpoints),
      row.id,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);

    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const row = rows[0];
    const endpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];
    const nextEndpoints = endpoints.filter((e) => e?.name !== 'upload-attachment-to-presigned-url');

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [
      JSON.stringify(nextEndpoints),
      row.id,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

