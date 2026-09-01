import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, host: true },
  build: {
    // three.js alone is ~800 kB minified (~208 kB gzipped). That is the floor
    // for a 3D app, so the threshold reflects the accepted baseline rather
    // than warning on every build.
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        // three + drei dominate the bundle and change far less often than app
        // code, so they get their own long-lived chunk.
        manualChunks: {
          three: ['three', 'three-stdlib'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          react: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
})
