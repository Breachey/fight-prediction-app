import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const configDirectory = dirname(fileURLToPath(import.meta.url))
const clientPackageJson = JSON.parse(
  readFileSync(resolve(configDirectory, 'package.json'), 'utf8')
)

function resolveBuildSha() {
  const ciCommitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.COMMIT_REF ||
    ''

  if (ciCommitSha) {
    return ciCommitSha.slice(0, 7)
  }

  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: configDirectory,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

const appVersion = clientPackageJson.version || '0.0.0'
const appBuildSha = resolveBuildSha()
const appBuildDate = new Date().toISOString()

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(process.env.NEXT_PUBLIC_API_URL),
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_SHA__: JSON.stringify(appBuildSha),
    __APP_BUILD_DATE__: JSON.stringify(appBuildDate)
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
