FROM node:20-slim AS build
WORKDIR /app
# Install pnpm
RUN npm i -g pnpm
# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.json tsconfig.nodejs.json ./
# Pre-copy package manifests for filtered workspaces
COPY packages/autopilot/package.json ./packages/autopilot/package.json
COPY packages/autopilot-runner/package.json ./packages/autopilot-runner/package.json
# Install only required workspaces
RUN pnpm install -w --filter @starships/autopilot --filter @starships/autopilot-runner --frozen-lockfile
# Copy sources for the two workspaces
COPY packages/autopilot/ ./packages/autopilot/
COPY packages/autopilot-runner/ ./packages/autopilot-runner/
# Build dependencies in order: autopilot first, then runner
RUN pnpm -C packages/autopilot build
RUN pnpm -C packages/autopilot-runner build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/autopilot-runner/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER 1000:1000
CMD ["node", "dist/index.js"]

