#!/bin/bash
set -e

echo "Testing semantic-release configuration..."

# Export GitHub token from gh CLI
export GITHUB_TOKEN=$(gh auth token)

# Run semantic-release in debug mode
echo "Running semantic-release with debug output..."
npx semantic-release --debug --dry-run 2>&1 | tee semantic-debug.log

# Check if it detected commits
echo ""
echo "Checking for version detection..."
if grep -q "The next release version is" semantic-debug.log; then
  VERSION=$(grep -oP 'The next release version is \K[0-9]+\.[0-9]+\.[0-9]+' semantic-debug.log)
  echo "✅ Detected next version: $VERSION"
else
  echo "❌ No version detected"
  echo ""
  echo "Recent commits since last tag:"
  git log --oneline v3.7.0..HEAD
  echo ""
  echo "Checking commit analysis..."
  grep -A5 "Analyzing commit" semantic-debug.log || echo "No commit analysis found"
fi