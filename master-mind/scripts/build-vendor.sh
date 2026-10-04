#!/usr/bin/env bash
# Rebuilds Master Mind's vendored bundles so the extension loads unpacked with no build step:
#   vendor/anthropic.js  official Anthropic TypeScript SDK as one ES module
#   vendor/markdown.js   scripts/markdown-entry.mjs (marked + DOMPurify policy + highlight.js + KaTeX)
#   vendor/katex/, vendor/fonts/, vendor/hljs-dark.css
# Usage: bash master-mind/scripts/build-vendor.sh
set -euo pipefail
MM="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --silent @anthropic-ai/sdk marked dompurify katex highlight.js @fontsource-variable/inter @fontsource-variable/jetbrains-mono esbuild

ESB=(npx esbuild --bundle --format=esm --platform=browser --target=chrome120 --minify --legal-comments=eof)
echo "export { default } from '@anthropic-ai/sdk';" > anthropic-entry.mjs
"${ESB[@]}" anthropic-entry.mjs --outfile="$MM/vendor/anthropic.js"
cp "$MM/scripts/markdown-entry.mjs" ./markdown-entry.mjs
"${ESB[@]}" markdown-entry.mjs --outfile="$MM/vendor/markdown.js"

mkdir -p "$MM/vendor/katex/fonts" "$MM/vendor/fonts"
cp node_modules/katex/dist/katex.min.css "$MM/vendor/katex/"
cp node_modules/katex/dist/fonts/*.woff2 "$MM/vendor/katex/fonts/"
cp node_modules/highlight.js/styles/github-dark.min.css "$MM/vendor/hljs-dark.css"
cp node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2 \
   node_modules/@fontsource-variable/inter/files/inter-latin-wght-italic.woff2 \
   node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2 "$MM/vendor/fonts/"
echo "Rebuilt vendor bundles in $MM/vendor"
