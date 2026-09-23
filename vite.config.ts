import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefixo vazio: carrega FRONT_PORT/PORT do .env, não só as VITE_*.
  const env = loadEnv(mode, process.cwd(), '')
  const frontPort = Number(env.FRONT_PORT) || 3000
  const apiPort = Number(env.PORT) || 3001

  return {
    plugins: [react()],
    server: {
      port: frontPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        '/agent-hub': {
          target: `ws://localhost:${apiPort}`,
          ws: true,
        }
      }
    }
  }
})
