FROM node:18-alpine
WORKDIR /app
COPY ../../ .
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile && pnpm run --filter @starships/mcp-server build
CMD ["node", "packages/mcp-server/dist/index.js"] 