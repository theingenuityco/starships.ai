FROM node:18-alpine
WORKDIR /app
COPY ../../ .
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile && pnpm run --filter @starships/server build
CMD ["node", "packages/server/dist/index.js"] 