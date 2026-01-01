# @starships/docs

Documentation site for **starships.ai** (Next.js + Fumadocs). This is the human-facing docs UI served at `/docs`.

> Note: this is separate from `public-docs/`, which is markdown indexed by the API for in-product/agent consumption via `GET /api/v1/docs`.

## Run

From the repo root (recommended):

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Then open `http://localhost:8080/docs` (routed via `@starships/reverse-proxy`).

To run only this package:

```bash
pnpm -w --filter @starships/docs dev
```

Default port is `3001` (`DOCS_PORT`).

## Content & structure

- **MDX content** lives in `packages/docs/content/docs/`
- **Fumadocs source** is wired via `lib/source.ts` and `source.config.ts`
- **Search** is implemented as a Next.js route handler at `app/api/search/route.ts`
- **LLM export**: `app/llms-full.txt/route.ts` provides a plain-text export for LLM tooling

## Environment

This package reads environment variables from the monorepo root during local development (see `next.config.mjs` and `@starships/env`). Common variables include:

- `DOCS_PORT` (default 3001)
- `PUBLIC_URL` (used for canonical URLs/redirects)
- `ENABLE_INDEXING` (controls robots/sitemap behavior)

## Links

- Root: `../../README.md`
- Public docs (agent-indexed): `../../public-docs/README.md`
