import crypto from 'crypto';
import type { Request } from 'express';
import type { ConnectorProvider, SecretRef } from '@starships/protocol';
import { AppError, AuthError, NotFoundError, ValidationError } from '@starships/errors';
import {
  AutopilotAwaitFiringRepository,
  AutopilotAwaitRepository,
  ConnectorEventRepository,
  ConnectorRepository,
  ConnectorSecretRepository,
  ConnectorTemplateRepository,
  ConnectorWebhookBindingRepository,
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

type ConnectorWebhookRoutingConfig = {
  /**
   * Provider-derived identifier that lets the server route to a connector instance.
   * This should be stable per tenant/installation/workspace/server.
   */
  externalAccountId?: WebhookFieldSource;
  /**
   * Optional connect-time mapping key: if set, we expect connectors.metadata[fromConnectorMetadataKey]
   * to contain the externalAccountId, and we upsert a binding row.
   */
  fromConnectorMetadataKey?: string;
};

type ConnectorWebhookTemplateConfig = {
  routing?: ConnectorWebhookRoutingConfig;
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseWebhookFieldSource(v: unknown): WebhookFieldSource | undefined {
  if (!isRecord(v)) return undefined;
  const headerName = v.headerName;
  if (isNonEmptyString(headerName)) return { headerName: headerName.trim() };
  const jsonPointer = v.jsonPointer;
  if (isNonEmptyString(jsonPointer)) return { jsonPointer: jsonPointer.trim() };
  const value = v.value;
  if (isNonEmptyString(value)) return { value: value.trim() };
  return undefined;
}

function parseSecretRef(v: unknown): SecretRef | null {
  if (!isRecord(v)) return null;
  const type = v.type;
  const key = v.key;
  if (!isNonEmptyString(type) || !isNonEmptyString(key)) return null;
  // NOTE: SecretRef.type is a union in protocol; keep runtime permissive but require strings.
  return { type: type.trim() as SecretRef['type'], key: key.trim() };
}

function parseWebhookVerificationConfig(v: unknown): WebhookVerificationConfig | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isRecord(v)) return undefined;

  const type = v.type;
  if (!isNonEmptyString(type)) return undefined;
  const normalized = type.trim();
  if (normalized === 'none') return { type: 'none' };

  if (normalized !== 'hmac_sha256_base64' && normalized !== 'hmac_sha256_hex') return undefined;
  const headerName = v.headerName;
  const secretRef = parseSecretRef(v.secretRef);
  if (!isNonEmptyString(headerName) || !secretRef) return undefined;

  return { type: normalized, headerName: headerName.trim(), secretRef };
}

function parseConnectorWebhookTemplateConfig(raw: unknown): ConnectorWebhookTemplateConfig {
  if (!isRecord(raw)) return {};
  const routingRaw = raw.routing;
  const routing: ConnectorWebhookRoutingConfig | undefined = isRecord(routingRaw)
    ? {
        externalAccountId: parseWebhookFieldSource(routingRaw.externalAccountId),
        fromConnectorMetadataKey: isNonEmptyString(routingRaw.fromConnectorMetadataKey)
          ? routingRaw.fromConnectorMetadataKey.trim()
          : undefined,
      }
    : undefined;

  const payloadRaw = raw.payload;
  const payload =
    isRecord(payloadRaw) && isNonEmptyString(payloadRaw.jsonPointer) ? { jsonPointer: payloadRaw.jsonPointer.trim() } : undefined;

  return {
    routing,
    verification: parseWebhookVerificationConfig(raw.verification),
    eventType: parseWebhookFieldSource(raw.eventType),
    externalEventId: parseWebhookFieldSource(raw.externalEventId),
    payload,
  };
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
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
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
  if ('value' in source) return coerceString(source.value).trim();
  if ('headerName' in source) return coerceString(req.get(source.headerName) || '').trim();
  if ('jsonPointer' in source) return coerceString(getByJsonPointer(parsedBody, source.jsonPointer) || '').trim();
  return '';
}

export class ConnectorEventIngestionService {
  private connectorRepo = new ConnectorRepository();
  private templateRepo = new ConnectorTemplateRepository();
  private connectorEventRepo = new ConnectorEventRepository();
  private awaitRepo = new AutopilotAwaitRepository();
  private awaitFiringRepo = new AutopilotAwaitFiringRepository();
  private bindingRepo = new ConnectorWebhookBindingRepository();
  private platformSecrets = new PlatformSecretService();
  private connectorSecrets = new ConnectorSecretRepository();

  private async resolveSecret(ref: SecretRef, connectorId: string): Promise<string | null> {
    if (!ref || typeof ref !== 'object') return null;
    const type = ref.type;
    const key = String(ref.key || '').trim();
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
      throw new ValidationError(`Missing signature header: ${cfg.headerName}`, cfg.headerName);
    }

    const secret = await this.resolveSecret(cfg.secretRef, connectorId);
    if (!secret) {
      throw new AppError('Webhook signing secret not configured', 'WEBHOOK_SECRET_NOT_CONFIGURED', 500, {
        details: { ref: `${cfg.secretRef.type}:${String(cfg.secretRef.key || '').trim() || '__missing__'}` },
      });
    }

    const digest =
      cfg.type === 'hmac_sha256_base64'
        ? crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
        : crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    if (!safeEqual(digest, header)) {
      throw new AuthError('Webhook signature verification failed');
    }
  }

  /**
   * Ingest a connector webhook request:
   * - Resolve connector instance(s) via routing externalAccountId binding
   * - Verify signature (template-driven)
   * - Normalize event_type / external_event_id / payload_json
   * - Persist connector_events (deduped)
   * - Match + enqueue await resumes
   */
  async ingestConnectorWebhook(args: { provider: string; req: Request }): Promise<{
    externalAccountId?: string;
    routedConnectorIds: string[];
    connectorEventIds: string[];
    matchedAwaitIds: string[];
    enqueuedFiringIds: string[];
  }> {
    const provider = String(args.provider || '').trim();
    if (!provider) throw new ValidationError('provider is required', 'provider');

    const template = await this.templateRepo.findByProvider(provider as unknown as ConnectorProvider);
    if (!template) {
      throw new NotFoundError('connector_template', provider);
    }

    const cfg = parseConnectorWebhookTemplateConfig(template.webhooksJson);

    const reqAny = args.req as unknown as { body?: unknown; headers?: unknown };
    const rawBody = Buffer.isBuffer(reqAny.body) ? (reqAny.body as Buffer) : Buffer.from('');

    const rawText = rawBody.toString('utf8');
    let parsedBody: unknown = undefined;
    try {
      parsedBody = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsedBody = { raw: rawText };
    }

    const externalAccountId = resolveField(cfg.routing?.externalAccountId, args.req, parsedBody) || '';
    if (!externalAccountId) {
      logger.warn('[ConnectorEventIngestion] Missing routing externalAccountId', { provider });
      return { externalAccountId: undefined, routedConnectorIds: [], connectorEventIds: [], matchedAwaitIds: [], enqueuedFiringIds: [] };
    }

    // Resolve connector instances (fanout allowed)
    const routedConnectorIds = await this.bindingRepo.listConnectorIds(provider, externalAccountId);
    if (!routedConnectorIds.length) {
      logger.info('[ConnectorEventIngestion] No bindings found for routing key', { provider, externalAccountId });
      return { externalAccountId, routedConnectorIds: [], connectorEventIds: [], matchedAwaitIds: [], enqueuedFiringIds: [] };
    }

    const connectors = await this.connectorRepo.findByIds(routedConnectorIds);
    if (!connectors.length) {
      logger.warn('[ConnectorEventIngestion] Bindings resolved but connectors missing', { provider, externalAccountId });
      return { externalAccountId, routedConnectorIds, connectorEventIds: [], matchedAwaitIds: [], enqueuedFiringIds: [] };
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

    const headersJson = redactHeaders(isRecord(reqAny.headers) ? (reqAny.headers as Record<string, unknown>) : {});

    const queue = getAutopilotAutomationQueue();
    const connectorEventIds: string[] = [];
    const matchedAwaitIds: string[] = [];
    const enqueuedFiringIds: string[] = [];

    for (const connector of connectors) {
      // Verify per-connector (secrets may be per-connector).
      try {
        await this.verifyWebhook(cfg.verification, args.req, rawBody, connector.id);
      } catch (err) {
        logger.warn('[ConnectorEventIngestion] Signature verification failed for routed connector', {
          provider,
          externalAccountId,
          connectorId: connector.id,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

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
      connectorEventIds.push(event.id);

      // Match awaits and enqueue resume jobs (per connector)
      const awaits = await this.awaitRepo.findWaitingMatches({
        starshipId: connector.starshipId,
        provider: String(connector.provider),
        connectorId: connector.id,
        eventType,
        limit: 200,
      });

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
    }

    try {
      logger.info('[ConnectorEventIngestion] ingested', {
        provider,
        externalAccountId,
        routedConnectorIds,
        eventType,
        externalEventId: externalEventId || undefined,
        connectorEventIds,
        matchedAwaits: matchedAwaitIds.length,
        enqueuedFirings: enqueuedFiringIds.length,
      });
    } catch {
      // ignore
    }

    return { externalAccountId, routedConnectorIds, connectorEventIds, matchedAwaitIds, enqueuedFiringIds };
  }
}

export default ConnectorEventIngestionService;

