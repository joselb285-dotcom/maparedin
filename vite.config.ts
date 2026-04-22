import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ftth/',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/zabbix-proxy': {
        target: process.env.VITE_ZABBIX_TARGET ?? 'http://10.20.200.247',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/zabbix-proxy/, ''),
      }
    }
  }
})
