## Connector Webhooks (Inbound Events) — Template Config Reference

This page describes how **connector templates** can be configured to ingest **inbound webhook events** and turn them into normalized connector events that can resume automations waiting on `await (kind="connector_event")`.

This is **generic** and provider-agnostic: providers differ, but the server ingestion pipeline expects the same *shape* of configuration.

---

### Global webhook endpoint (server)

Inbound connector webhooks are delivered to a **global** endpoint (no starship id in the URL):

- `POST /api/v1/webhooks/connectors/:provider`

The server must route each inbound request to the correct connector instance(s) using a provider-derived external account identifier.

---

### Where this config lives

- Connector template field: **`webhooksJson`** (API) / **`webhooks_json`** (DB JSONB)
- This field is **server-consumed**.
- The `connector_action` node does not read or depend on `webhooksJson`.

---

## `webhooksJson` schema (server-consumed)

At a high level, `webhooksJson` has four concerns:

- **routing**: how to find the external account id so the server can route to connector instance(s)
- **verification**: how to verify the webhook signature
- **eventType / externalEventId**: how to extract stable event identifiers for matching + idempotency
- **payload**: how to select which part of the inbound payload becomes the normalized `payloadJson`

### Field source (`WebhookFieldSource`)

Many fields are resolved using a common “field source” shape:

```json
{ "headerName": "X-Some-Header" }
```

or:

```json
{ "jsonPointer": "/path/to/value" }
```

or:

```json
{ "value": "constant-string" }
```

Behavior:

- `headerName`: value is read from the HTTP request header
- `jsonPointer`: value is read from the parsed JSON body using RFC 6901 JSON Pointer semantics
- `value`: constant string

If the field cannot be resolved, it is treated as missing/empty.

---

### `routing`

```json
{
  "routing": {
    "externalAccountId": { "jsonPointer": "/external_account_id" },
    "fromConnectorMetadataKey": "externalAccountId"
  }
}
```

- **`routing.externalAccountId?: WebhookFieldSource`**
  - Required to route inbound webhook requests.
  - The resolved value is treated as the **externalAccountId** for this provider.
  - The server uses `(provider, externalAccountId)` to look up bound connector instance(s) and may fan out to multiple connectors.

- **`routing.fromConnectorMetadataKey?: string`**
  - Optional connect-time/backfill helper.
  - If provided, the server expects connector instances to store `connectors.metadata[fromConnectorMetadataKey]` as the external account id, and will upsert routing bindings automatically on (re)connect.

---

### `verification`

Webhook signature verification is template-driven and uses `SecretRef` (no raw secrets).

Supported modes:

- `none`
- `hmac_sha256_base64`
- `hmac_sha256_hex`

```json
{
  "verification": {
    "type": "hmac_sha256_hex",
    "headerName": "X-Signature",
    "secretRef": { "type": "connector_secret", "key": "WEBHOOK_SIGNING_SECRET" }
  }
}
```

Fields:

- **`type`**: one of the modes above
- **`headerName`**: where the request signature is found
- **`secretRef`**: where the signing secret is stored (platform or connector scope)

Behavior notes:

- Verification is performed against the **raw request body**.
- When routing fans out to multiple connectors, verification may be attempted per connector (secrets can be connector-scoped).

---

### `eventType` and `externalEventId`

```json
{
  "eventType": { "headerName": "X-Event-Type" },
  "externalEventId": { "jsonPointer": "/id" }
}
```

- **`eventType?: WebhookFieldSource`**
  - If omitted or empty, the server uses a generic fallback event type.
  - `await (kind="connector_event")` matches on this `eventType` string (wildcards allowed in await specs).

- **`externalEventId?: WebhookFieldSource`**
  - Optional stable provider-supplied event id.
  - When present, the server can dedupe events per connector instance for idempotency.

---

### `payload`

```json
{
  "payload": { "jsonPointer": "/data" }
}
```

- **`payload.jsonPointer?: string`**
  - If present, selects a subtree of the inbound payload to become `payloadJson`.
  - If omitted, the entire parsed payload is used.

---

## Operational notes

- **Routing without per-starship URLs**: the webhook URL does not include `starshipId`. Routing must be derived from the inbound request.
- **Fanout**: a single `(provider, externalAccountId)` may map to multiple connector instances. In that case, the server may ingest one normalized event per connector and attempt resumes per connector.
- **Backfill**: if connectors were connected before webhook routing was configured, a one-time backfill can populate routing bindings from existing connector metadata. Reconnecting a connector can also populate bindings when `routing.fromConnectorMetadataKey` is set.

