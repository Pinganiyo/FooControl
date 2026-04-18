import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all local IPs to allow testing from mobile
    proxy: {
      '/api': {
        target: 'http://localhost:8880',
        changeOrigin: true,
      }
    }
  }
})
