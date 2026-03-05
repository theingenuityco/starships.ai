# @starships/autopilot-runner

Low-latency runner exposing Execute and ExecuteStream via ConnectRPC (HTTP/2), backed by an in-process Engine and an in-memory queue.

This service is used by `@starships/server` when `RUNNER_URL` is set (see `.env.example`). If `RUNNER_URL` is unset, Autopilot falls back to a local child-process runner.

## Install & Run

```bash
pnpm -w --filter @starships/autopilot-runner build
pnpm -w --filter @starships/autopilot-runner start
```

Env:
- RUNNER_PORT (default 50051)
- RUNNER_CONCURRENCY (default 4)
- RUNNER_AUTH_TOKEN (optional, `Authorization: Bearer <token>`)
- RUNNER_FASTPATH_ENABLED (default true)

## API

- Execute (unary): returns `{ result_json, request_id, duration_ms }`
- ExecuteStream (server-streaming): chunks `{ type, data_json, request_id }` with `started`, `event`, `completed`, `error`.

Request fields:
- `blueprint_json`, `execution_json`, `config_json`, `request_id`, `priority`, `timeout_ms`

## Examples

Unary via curl (Connect protocol JSON):
```bash
curl --http2-prior-knowledge \
  -H 'Content-Type: application/json' \
  -d '{"blueprint_json":"{}","execution_json":"{}","config_json":"{}"}' \
  http://localhost:50051/runner.Runner/Execute
```

Server-streaming with buf curl (gRPC):
```bash
buf curl --protocol grpc --http2-prior-knowledge \
  -d '{"blueprint_json":"{}","execution_json":"{}","config_json":"{}"}' \
  http://localhost:50051/runner.Runner/ExecuteStream
```
