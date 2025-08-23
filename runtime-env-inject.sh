#!/bin/sh
# Runtime environment variable injection for Next.js
# This script creates a runtime config that can override build-time values

set -e

echo "🔧 Injecting runtime environment variables..."

# Create a runtime config file that will be loaded by the client
cat > /app/packages/client/public/__runtime_env.js << EOF
// Runtime environment configuration
// This file is generated at container startup and overrides build-time values
window.__RUNTIME_ENV__ = {
  KINDE_ISSUER_URL: "${KINDE_ISSUER_URL:-https://starshipsai.kinde.com}",
  KINDE_SITE_URL: "${KINDE_SITE_URL:-https://starships.ai}",
  KINDE_POST_LOGIN_REDIRECT_URL: "${KINDE_POST_LOGIN_REDIRECT_URL:-https://starships.ai/fleet}",
  KINDE_POST_LOGOUT_REDIRECT_URL: "${KINDE_POST_LOGOUT_REDIRECT_URL:-https://starships.ai}",
  NEXT_PUBLIC_API_URL: "${NEXT_PUBLIC_API_URL:-https://starships.ai/api}",
  RUNTIME_INJECTED: true
};
console.log('Runtime environment loaded:', window.__RUNTIME_ENV__);
EOF

echo "✅ Runtime environment variables injected"

# Continue with the original entrypoint
exec "$@"