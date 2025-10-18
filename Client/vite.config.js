import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(process.env.NEXT_PUBLIC_API_URL)
  },
  build: {
    // Enable minification for smaller bundle sizes
    minify: 'esbuild',
    // Configure chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor code into separate chunk
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Split country flag library separately
          flags: ['react-country-flag']
        }
      }
    },
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Set reasonable chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Optimize dependencies
    target: 'es2015'
  },
  // Optimize dev server
  server: {
    // Enable compression during dev
    compress: true
  }
})
