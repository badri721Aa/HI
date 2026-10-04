#!/usr/bin/env bash
# Rebuilds vendor/anthropic.js (the official Anthropic TypeScript SDK bundled as
# one ES module) so the extension loads unpacked with no build step.
# Usage: bash study-extension/scripts/bundle-sdk.sh
set -euo pipefail
OUT="$(cd "$(dirname "$0")/.." && pwd)/vendor/anthropic.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --silent @anthropic-ai/sdk esbuild
echo "export { default } from '@anthropic-ai/sdk';" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --target=chrome120 \
  --minify --legal-comments=eof --outfile="$OUT"
echo "Bundled @anthropic-ai/sdk $(node -p "require('./node_modules/@anthropic-ai/sdk/package.json').version" 2>/dev/null || grep -m1 '"version"' node_modules/@anthropic-ai/sdk/package.json) → $OUT"
