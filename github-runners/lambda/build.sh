#!/bin/bash
set -euo pipefail

# Always run relative to this script's directory so paths resolve correctly
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔨 Building Lambda deployment package from: $SCRIPT_DIR"

# Clean up old builds
rm -rf package lambda_function.zip

# Create package directory
mkdir -p package

# Pick pip for Python 3.11 (to match Lambda runtime)
echo "📦 Installing Python dependencies with Python 3.11..."
if command -v pip3.11 >/dev/null 2>&1; then
  PIP="pip3.11"
elif command -v python3.11 >/dev/null 2>&1; then
  PIP="python3.11 -m pip"
else
  echo "Python 3.11 not found. Please install python3.11/pip3.11." >&2
  exit 1
fi

# Avoid writing .pyc files into the zip (and avoid cross-version pyc issues)
export PYTHONDONTWRITEBYTECODE=1

# Install dependencies for Lambda's Linux x86_64 runtime
$PIP install --upgrade --no-cache-dir --target ./package \
  --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.11 \
  -r requirements.txt

# Copy Lambda function files
echo "📄 Copying Lambda functions..."
cp handler.py package/
cp cleanup.py package/

# Create deployment zip (deps + handlers at the zip root level)
echo "🗜️ Creating deployment package..."
cd package
zip -r ../lambda_function.zip . -q
cd ..

echo "✅ Lambda package created: lambda_function.zip"
echo "   Size: $(du -h lambda_function.zip | cut -f1)"

# Copy to terraform directory (used by terraform/main.tf via filebase64sha256)
TF_DIR="$SCRIPT_DIR/../terraform"
mkdir -p "$TF_DIR"
cp lambda_function.zip "$TF_DIR/"
echo "📋 Copied to terraform directory: $TF_DIR/lambda_function.zip"