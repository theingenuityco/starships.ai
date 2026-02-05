import crypto from 'crypto';
import type { Request } from 'express';
import type { SecretRef } from '@starships/protocol';
import {
  AutopilotAwaitFiringRepository,
  AutopilotAwaitRepository,
  ConnectorEventRepository,
  ConnectorRepository,
  ConnectorSecretRepository,
  ConnectorTemplateRepository,
} from '@starships/models';
import { PlatformSecretService } from '@/services/PlatformSecretService';
import { getAutopilotAutomationQueue } from '@/queues/autopilotAutomationQueue';
import { logger } from '@/utils/logger';

type WebhookVerificationConfig =
  | { type: 'none' }
  | {
      type: 'hmac_sha256_base64' | 'hmac_sha256_hex';
      headerName: string;
      secretRef: SecretRef;
    };

type WebhookFieldSource = { headerName: string } | { jsonPointer: string } | { value: string };

type ConnectorWebhookTemplateConfig = {
  verification?: WebhookVerificationConfig;
  eventType?: WebhookFieldSource;
  externalEventId?: WebhookFieldSource;
  payload?: { jsonPointer?: string };
};

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sensitive = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'api-key',
    'apikey',
    'x-auth-token',
    'x-shopify-hmac-sha256',
    'stripe-signature',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = sensitive.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
}

function parseJsonPointer(pointer: string): string[] {
  const p = String(pointer || '').trim();
  if (!p || p === '/') return [];
  if (!p.startsWith('/')) return [];
  return p
    .slice(1)
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function getByJsonPointer(obj: unknown, pointer: string): unknown {
  const parts = parseJsonPointer(pointer);
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function coerceString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return String(v);
}

function resolveField(source: WebhookFieldSource | undefined, req: Request, parsedBody: unknown): string {
  if (!source || typeof source !== 'object') return '';
  if ('value' in source) return coerceString((source as any).value).trim();
  if ('headerName' in source) return coerceString(req.get(String((source as any).headerName)) || '').trim();
  if ('jsonPointer' in source) return coerceString(getByJsonPointer(parsedBody, String((source as any).jsonPointer)) || '').trim();
  return '';
}

export class ConnectorEventIngestionService {
  private connectorRepo = new ConnectorRepository();
  private templateRepo = new ConnectorTemplateRepository();
  private connectorEventRepo = new ConnectorEventRepository();
  private awaitRepo = new AutopilotAwaitRepository();
  private awaitFiringRepo = new AutopilotAwaitFiringRepository();
  private platformSecrets = new PlatformSecretService();
  private connectorSecrets = new ConnectorSecretRepository();

  private async resolveSecret(ref: SecretRef, connectorId: string): Promise<string | null> {
    if (!ref || typeof ref !== 'object') return null;
    const type = (ref as any).type;
    const key = String((ref as any).key || '').trim();
    if (!key) return null;

    if (type === 'platform_secret') {
      return await this.platformSecrets.getSecret(key);
    }
    if (type === 'connector_secret') {
      try {
        const snapshot = await this.connectorSecrets.getDecryptedSecretsByConnector(connectorId);
        const v = snapshot?.[key];
        return typeof v === 'string' && v.trim() ? v : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  private async verifyWebhook(config: WebhookVerificationConfig | undefined, req: Request, rawBody: Buffer, connectorId: string) {
    const cfg = config ?? { type: 'none' as const };
    if (cfg.type === 'none') return;

    const header = String(req.get(cfg.headerName) || '').trim();
    if (!header) {
      throw new Error(`Missing signature header: ${cfg.headerName}`);
    }

    const secret = await this.resolveSecret(cfg.secretRef, connectorId);
    if (!secret) {
      throw new Error(`Webhook signing secret not configured for ref: ${cfg.secretRef.type}:${cfg.secretRef.key}`);
    }

    const digest =
      cfg.type === 'hmac_sha256_base64'
        ? crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
        : crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    if (!safeEqual(digest, header)) {
      throw new Error('Webhook signature verification failed');
    }
  }

  /**
   * Ingest a connector webhook request:
   * - Resolve connector instance and template
   * - Verify signature (template-driven)
   * - Normalize event_type / external_event_id / payload_json
   * - Persist connector_events (deduped)
   * - Match + enqueue await resumes
   */
  async ingestConnectorWebhook(args: { provider: string; starshipId: string; req: Request }): Promise<{
    connectorEventId: string;
    matchedAwaitIds: string[];
    enqueuedFiringIds: string[];
  }> {
    const provider = String(args.provider || '').trim();
    const starshipId = String(args.starshipId || '').trim();
    if (!provider) throw new Error('provider is required');
    if (!starshipId) throw new Error('starshipId is required');

    // Resolve connector instance
    const connector = await this.connectorRepo.findByStarshipAndProvider(starshipId, provider);
    if (!connector) {
      throw new Error(`No connector instance found for provider "${provider}" on starship "${starshipId}"`);
    }

    const template = await this.templateRepo.findByProvider(provider as any);
    if (!template) {
      throw new Error(`No connector template found for provider "${provider}"`);
    }

    const cfgRaw = (template as any).webhooksJson;
    const cfg: ConnectorWebhookTemplateConfig =
      cfgRaw && typeof cfgRaw === 'object' && !Array.isArray(cfgRaw) ? (cfgRaw as ConnectorWebhookTemplateConfig) : {};

    const reqAny = args.req as unknown as { body?: unknown; headers?: unknown };
    const rawBody = Buffer.isBuffer(reqAny.body) ? (reqAny.body as Buffer) : Buffer.from('');

    await this.verifyWebhook(cfg.verification, args.req, rawBody, connector.id);

    const rawText = rawBody.toString('utf8');
    let parsedBody: unknown = undefined;
    try {
      parsedBody = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsedBody = { raw: rawText };
    }

    const eventType = resolveField(cfg.eventType, args.req, parsedBody) || 'webhook_received';
    const externalEventId = resolveField(cfg.externalEventId, args.req, parsedBody) || null;

    const payloadValue =
      cfg.payload?.jsonPointer && cfg.payload.jsonPointer.trim().length > 0
        ? getByJsonPointer(parsedBody, cfg.payload.jsonPointer)
        : parsedBody;
    const payloadJson =
      payloadValue && typeof payloadValue === 'object' && !Array.isArray(payloadValue)
        ? (payloadValue as Record<string, unknown>)
        : { value: payloadValue };

    const headersJson = redactHeaders((reqAny.headers && typeof reqAny.headers === 'object' ? (reqAny.headers as any) : {}) as Record<
      string,
      unknown
    >);

    const event = await this.connectorEventRepo.createOrGetByExternalId({
      starshipId: connector.starshipId,
      connectorId: connector.id,
      provider: connector.provider,
      eventType,
      externalEventId,
      payloadJson,
      rawPayloadJson: parsedBody && typeof parsedBody === 'object' ? (parsedBody as Record<string, unknown>) : { raw: rawText },
      headersJson,
      receivedAt: new Date().toISOString(),
    });

    // Match awaits and enqueue resume jobs
    const awaits = await this.awaitRepo.findWaitingMatches({
      starshipId: connector.starshipId,
      provider: String(connector.provider),
      connectorId: connector.id,
      eventType,
      limit: 200,
    });

    const queue = getAutopilotAutomationQueue();
    const matchedAwaitIds: string[] = [];
    const enqueuedFiringIds: string[] = [];

    for (const a of awaits) {
      matchedAwaitIds.push(a.id);
      const firing = await this.awaitFiringRepo.createOrIgnore({ awaitId: a.id, connectorEventId: event.id });
      if (!firing) continue; // already exists

      enqueuedFiringIds.push(firing.id);
      await queue.add(
        'resume-await',
        { kind: 'resume', awaitFiringId: firing.id },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
    }

    try {
      logger.info('[ConnectorEventIngestion] ingested', {
        provider,
        starshipId,
        connectorId: connector.id,
        eventType,
        externalEventId: externalEventId || undefined,
        connectorEventId: event.id,
        matchedAwaits: awaits.length,
        enqueuedFirings: enqueuedFiringIds.length,
      });
    } catch {
      // ignore
    }

    return { connectorEventId: event.id, matchedAwaitIds, enqueuedFiringIds };
  }
}

export default ConnectorEventIngestionService;

