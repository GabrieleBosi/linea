/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// `vite build --mode static` (npm run build:static) builds the public demo: VITE_DATA_MODE=static
// and the backend module swapped for the static one, so the bundle holds no Supabase client, no
// function calls and no keys. Any other mode builds the full-stack app.
export default defineConfig(({ mode }) => {
  const staticBuild = mode === 'static' || process.env.VITE_DATA_MODE === 'static'
  return {
    plugins: [
      // The router plugin must run before the React plugin.
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    define: {
      'import.meta.env.VITE_DATA_MODE': JSON.stringify(staticBuild ? 'static' : 'full'),
    },
    resolve: {
      alias: [
        ...(staticBuild ? [{ find: /^@\/lib\/backend$/, replacement: path.resolve(import.meta.dirname, './src/lib/backend.static.ts') }] : []),
        { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
      ],
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  }
})
