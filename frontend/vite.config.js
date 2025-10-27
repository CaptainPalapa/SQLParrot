/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // Ensure assets are served from root
  server: {
    port: 3000,
    host: true,
    open: true,  // Automatically open browser
    strictPort: true,  // Fail if port is already in use instead of port hopping
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
  },
})
