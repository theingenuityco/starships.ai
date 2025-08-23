#!/bin/bash

# Fix all imports from @starships/*/src/* to @starships/*

echo "Fixing imports in server package..."

# Fix imports in server
find packages/server/src -name "*.ts" -type f -exec sed -i '' \
  -e "s|from '@starships/protocol/src/[^']*'|from '@starships/protocol'|g" \
  -e "s|from '@starships/models/src/[^']*'|from '@starships/models'|g" \
  -e "s|from '@starships/agent-engine/src/[^']*'|from '@starships/agent-engine'|g" \
  -e "s|from '@starships/core/src/[^']*'|from '@starships/core'|g" \
  {} \;

echo "Imports fixed!"