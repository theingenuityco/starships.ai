#!/bin/bash

echo "Fixing all /src/ imports in compiled JavaScript..."

# Fix all imports in server dist
find /app/packages/server/dist -name "*.js" -type f -exec sed -i \
  -e "s|require('@starships/\\([^/]*\\)/src/\\([^']*\\)')|require('@starships/\\1/dist/\\2')|g" \
  -e "s|from '@starships/\\([^/]*\\)/src/\\([^']*\\)'|from '@starships/\\1/dist/\\2'|g" \
  {} \;

# Fix all imports in agent-engine dist  
find /app/packages/agent-engine/dist -name "*.js" -type f -exec sed -i \
  -e "s|require('@starships/\\([^/]*\\)/src/\\([^']*\\)')|require('@starships/\\1/dist/\\2')|g" \
  -e "s|from '@starships/\\([^/]*\\)/src/\\([^']*\\)'|from '@starships/\\1/dist/\\2'|g" \
  {} \;

# Fix all imports in models dist
find /app/packages/models/dist -name "*.js" -type f -exec sed -i \
  -e "s|require('@starships/\\([^/]*\\)/src/\\([^']*\\)')|require('@starships/\\1/dist/\\2')|g" \
  -e "s|from '@starships/\\([^/]*\\)/src/\\([^']*\\)'|from '@starships/\\1/dist/\\2'|g" \
  {} \;

# Fix all imports in protocol dist
find /app/packages/protocol/dist -name "*.js" -type f -exec sed -i \
  -e "s|require('@starships/\\([^/]*\\)/src/\\([^']*\\)')|require('@starships/\\1/dist/\\2')|g" \
  -e "s|from '@starships/\\([^/]*\\)/src/\\([^']*\\)'|from '@starships/\\1/dist/\\2'|g" \
  {} \;

# Fix all imports in core dist
find /app/packages/core/dist -name "*.js" -type f -exec sed -i \
  -e "s|require('@starships/\\([^/]*\\)/src/\\([^']*\\)')|require('@starships/\\1/dist/\\2')|g" \
  -e "s|from '@starships/\\([^/]*\\)/src/\\([^']*\\)'|from '@starships/\\1/dist/\\2'|g" \
  {} \;

echo "Import paths fixed!"