# @starships/server

Express API for Starships. Provides endpoints for starships, agents, conversations, and workflow execution with SSE streaming.

## Run

```bash
pnpm install
pnpm dev    # http://localhost:4000
pnpm build && pnpm start
```

Key envs:

```env
SERVER_PORT=4000
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DATABASE=starships
JWT_SECRET=your_32_byte_secret
```

## Essential endpoints (prefix: /api/v1)

Health:

```http
GET /health
GET /health/detailed
GET /health/metrics
```

Starships:

```http
POST /starships
GET  /starships/:idOrSlug
PUT  /starships/:id
DELETE /starships/:id
POST /starships/:id/agents/:agentId
GET  /starships/:id/agents
```

Conversations:

```http
POST /conversations
POST /conversations/:conversationId/messages
GET  /conversations/:conversationId/messages        # JSON or set Accept: text/event-stream for SSE
GET  /starships/:starshipId/conversations
```

Agents:

```http
POST /agents
PUT  /agents/:id
DELETE /agents/:id
PUT  /agents/:id/starship
GET  /agents
GET  /agents/public
GET  /agents/search?q=...
GET  /agents/:slugOrId
GET  /starships/:starshipId/agents
```

Example (create starship):

```bash
API=http://localhost:4000/api/v1
curl -X POST $API/starships \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Enterprise"}'
```

## Security & observability

- JWT auth middleware on protected routes
- CORS, rate limiting, structured errors
- Health and detailed health probes

## Troubleshooting

1. Server health

```bash
curl -s http://localhost:4000/api/v1/health | jq .
```

2. DB connectivity

```bash
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DATABASE -c 'select 1'
```

3. Auth failures

- Verify `Authorization: Bearer <token>` header and token issuer

Out-of-date? Open an issue with failing cURL and response.
