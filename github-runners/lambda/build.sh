#!/bin/bash

# Build Lambda deployment package with dependencies

echo "🔨 Building Lambda deployment package..."

# Clean up old builds
rm -rf package lambda_function.zip

# Create package directory
mkdir -p package

# Install dependencies (skip binary wheels for cryptography issues)
echo "📦 Installing Python dependencies..."
pip install --target ./package -r requirements.txt --quiet

# Copy Lambda function files
echo "📄 Copying Lambda functions..."
cp handler.py package/
cp cleanup.py package/

# Create deployment zip
echo "🗜️ Creating deployment package..."
cd package
zip -r ../lambda_function.zip . -q
cd ..

# Clean up
rm -rf package

echo "✅ Lambda package created: lambda_function.zip"
echo "   Size: $(du -h lambda_function.zip | cut -f1)"

# Copy to terraform directory
cp lambda_function.zip ../terraform/
echo "📋 Copied to terraform directory"