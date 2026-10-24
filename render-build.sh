#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "📦 Installing root dependencies..."
npm install

echo "🔨 Building client for production..."
npm run build

echo "✅ Build completed successfully."
