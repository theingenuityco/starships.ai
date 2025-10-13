FROM node:20-slim AS build
WORKDIR /app
# Copy workspace root files for pnpm install
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY tsconfig.json tsconfig.nodejs.json ./
RUN npm i -g pnpm && pnpm fetch
# Copy only the runner package
COPY ./packages/autopilot-runner/ ./packages/autopilot-runner/
RUN echo "node-linker=hoisted" >> packages/autopilot-runner/.npmrc \
  && pnpm -C packages/autopilot-runner install \
  && pnpm -C packages/autopilot-runner build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/autopilot-runner/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER 1000:1000
CMD ["node", "dist/index.js"]

