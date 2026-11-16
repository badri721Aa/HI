import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/postcss'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')

/** A fresh id per build. The game compares it with /version.json to notice a newer deploy. */
const BUILD_ID = Date.now().toString(36)

/** Writes /version.json next to the page (fetched with no-store; see vercel.json). */
const versionFile = (): Plugin => ({
  name: 'starfall-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ build: BUILD_ID })}\n` })
  },
})

// Standalone static build of Starfall Isle (no Next.js server needed).
export default defineConfig(({ command }) => ({
  root: here,
  publicDir: path.join(here, 'public'),
  plugins: [react(), versionFile()],
  // Lets shared components know they're in the standalone site (no arcade to link back to).
  define: {
    'process.env.NEXT_PUBLIC_STARFALL_STANDALONE': JSON.stringify('1'),
    // Only real builds check for newer versions (the dev server has no version file).
    'process.env.NEXT_PUBLIC_STARFALL_BUILD': JSON.stringify(command === 'build' ? BUILD_ID : ''),
  },
  resolve: {
    alias: [
      { find: 'next/link', replacement: path.join(here, 'src/link-shim.tsx') },
      { find: /^@\//, replacement: `${repo}/` },
    ],
  },
  css: { postcss: { plugins: [tailwind()] } },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: id => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  server: { fs: { allow: [repo] } },
}))
