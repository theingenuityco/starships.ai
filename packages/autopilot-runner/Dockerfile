FROM node:20-slim AS build
WORKDIR /app
# Install pnpm
RUN npm i -g pnpm
# Pre-copy only runner package manifests for a scoped install
COPY packages/autopilot-runner/package.json packages/autopilot-runner/pnpm-lock.yaml* packages/autopilot-runner/.npmrc ./packages/autopilot-runner/
RUN pnpm -C packages/autopilot-runner install --frozen-lockfile
# Copy runner source and build
COPY ./packages/autopilot-runner/ ./packages/autopilot-runner/
RUN pnpm -C packages/autopilot-runner build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/autopilot-runner/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER 1000:1000
CMD ["node", "dist/index.js"]

