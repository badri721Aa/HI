import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/postcss'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')

// Standalone static build of Starfall Isle (no Next.js server needed).
export default defineConfig({
  root: here,
  publicDir: path.join(here, 'public'),
  plugins: [react()],
  // Lets shared components know they're in the standalone site (no arcade to link back to).
  define: { 'process.env.NEXT_PUBLIC_STARFALL_STANDALONE': JSON.stringify('1') },
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
})
