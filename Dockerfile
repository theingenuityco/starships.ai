# ---- Base Stage ----
FROM node:20-alpine AS base
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy project files into the container
COPY . .

# Install dependencies with a frozen lockfile
RUN pnpm install --frozen-lockfile

# Build only the server package using turborepo
RUN pnpm turbo run build --filter=server...

# ---- Runtime Stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built server artifacts and dependencies
COPY --from=base /app/packages/server/dist ./dist
COPY --from=base /app/packages/server/package.json ./package.json

# Copy bridge-core package needed at runtime
COPY --from=base /app/packages/bridge-core ./packages/bridge-core

# Copy node_modules from the build stage
COPY --from=base /app/node_modules ./node_modules

# Expose the application port
EXPOSE 4000

# Start the application
CMD ["node", "dist/index.js"] 