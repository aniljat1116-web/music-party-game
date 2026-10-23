#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "📦 Installing root dependencies..."
npm install

echo "🌐 Configuring Puppeteer browser cache..."
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-/opt/render/project/src/.cache/puppeteer}"
mkdir -p "$PUPPETEER_CACHE_DIR"

echo "🔨 Building client and installing Chrome for Render..."
npm run build

echo "✅ Build completed successfully."
