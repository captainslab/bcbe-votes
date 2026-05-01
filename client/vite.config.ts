import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configuredTarget = env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:4100'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: configuredTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
