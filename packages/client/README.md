# @starships/client

Next.js frontend for Starships. Provides the UI for planning, running, and observing agent workflows.

## Run & debug

```bash
pnpm install
cp .env.example .env.local
pnpm dev # http://localhost:3000
```

Key envs:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
SERVER_URL=http://localhost:4000
```

Scripts:

```bash
pnpm dev
pnpm build && pnpm start
pnpm type-check && pnpm lint
```

## App map

- `/` landing and demo
- `/login` authentication
- `/ship/[slug]` starship workspace
  - `/conversations` chat and streaming
- `/marketplace` agent templates

## Interactive demo (recommended)

1. Start API (`packages/server`) and client
2. Visit `/` and sign in. Create a starship if prompted
3. Go to `/ship/[slug]/conversations`, start a conversation, observe SSE streaming

## Integration points

- API base: `NEXT_PUBLIC_API_URL`
- Streaming: Server-Sent Events (GET `/api/v1/conversations/:id/messages?stream=true`)
- Auth: JWT header forwarding; login page provided

## Troubleshooting

1. Backend connection

```bash
echo $NEXT_PUBLIC_API_URL
curl -s $NEXT_PUBLIC_API_URL/api/v1/health | jq .
```

2. SSE not streaming

- Check `Accept: text/event-stream` and CORS

3. Auth issues

- Ensure JWT is present and not expired

## Links

- Root: `../../README.md`
- Server: `../server/README.md`
- Autopilot: `../autopilot/README.md`

Out-of-date? Open an issue with a screenshot and steps.
