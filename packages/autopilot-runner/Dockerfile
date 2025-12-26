FROM node:20-slim AS build
WORKDIR /app
# For multi-arch builds (docker buildx), BuildKit provides TARGETARCH (amd64/arm64)
ARG TARGETARCH
ARG BUF_VERSION=v1.45.0
# Install pnpm
RUN npm i -g pnpm
# Install curl for fetching buf
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.json tsconfig.nodejs.json ./
# Pre-copy package manifests for filtered workspaces
COPY packages/autopilot/package.json ./packages/autopilot/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json
COPY packages/autopilot-runner/package.json ./packages/autopilot-runner/package.json
# Install only required workspaces with hoisted node linker for local deps
RUN echo "node-linker=hoisted" >> packages/autopilot-runner/.npmrc \
  && pnpm install -w --filter @starships/autopilot --filter @starships/protocol --filter @starships/autopilot-runner --frozen-lockfile
# Copy sources for the required workspaces
COPY packages/autopilot/ ./packages/autopilot/
COPY packages/protocol/ ./packages/protocol/
COPY packages/autopilot-runner/ ./packages/autopilot-runner/
# Build dependencies in order: autopilot -> protocol -> generate runner types -> runner
RUN pnpm -C packages/autopilot build
RUN pnpm -C packages/protocol build
RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) BUF_ARCH="x86_64" ;; \
    arm64) BUF_ARCH="aarch64" ;; \
    *) echo "Unsupported TARGETARCH=${TARGETARCH} (expected amd64 or arm64)"; exit 1 ;; \
  esac; \
  curl -fsSL -o /usr/local/bin/buf "https://github.com/bufbuild/buf/releases/download/${BUF_VERSION}/buf-Linux-${BUF_ARCH}"; \
  chmod +x /usr/local/bin/buf; \
  buf --version; \
  pnpm -C packages/autopilot-runner gen; \
  pnpm -C packages/autopilot-runner build

FROM node:20-slim
WORKDIR /app/packages/autopilot-runner
ENV NODE_ENV=production
COPY --from=build /app/packages/autopilot-runner/dist ./dist
COPY --from=build /app/packages/autopilot-runner/node_modules ./node_modules
# Provide workspace-linked @starships/autopilot package in runtime
RUN mkdir -p /app/packages/autopilot
COPY --from=build /app/packages/autopilot/package.json /app/packages/autopilot/package.json
COPY --from=build /app/packages/autopilot/dist /app/packages/autopilot/dist
COPY --from=build /app/packages/autopilot/node_modules /app/packages/autopilot/node_modules
# Provide workspace-linked @starships/protocol package in runtime
RUN mkdir -p /app/packages/protocol
COPY --from=build /app/packages/protocol/package.json /app/packages/protocol/package.json
COPY --from=build /app/packages/protocol/dist /app/packages/protocol/dist
COPY --from=build /app/packages/protocol/node_modules /app/packages/protocol/node_modules
COPY --from=build /app/node_modules /app/node_modules
USER 1000:1000
CMD ["node", "dist/index.js"]

