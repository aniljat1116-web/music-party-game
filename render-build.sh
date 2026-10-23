#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "📦 Installing root dependencies..."
npm install

echo "🔨 Building client application..."
npm run build

echo "🌐 Installing Chromium browser for Puppeteer..."
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-/opt/render/project/src/.cache/puppeteer}"
mkdir -p "$PUPPETEER_CACHE_DIR"
npx puppeteer browsers install chrome

echo "✅ Build completed successfully."
