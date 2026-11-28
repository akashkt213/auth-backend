import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // backend CORS + email links default to this port
    // Proxy /api to the backend so requests are same-origin and the
    // httpOnly auth cookies are sent without any CORS setup.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
