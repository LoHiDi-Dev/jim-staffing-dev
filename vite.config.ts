import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      // Local dev convenience: allow VITE_API_BASE_URL=http://localhost:5174/api/v1
      // while the Fastify API runs on :8787.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

