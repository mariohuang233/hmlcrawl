import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'build',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ECharts is intentionally lazy, but its renderer, chart series and
          // components are still substantial. Keep them cacheable and below the
          // default warning threshold instead of shipping one opaque mega-chunk.
          // zrender has a one-way dependency relationship with ECharts, so it
          // is safe to cache separately without creating circular chunks.
          if (id.includes('/node_modules/zrender/')) return 'zrender';
          if (id.includes('/node_modules/echarts/')) return 'echarts-core';
          if (id.includes('/node_modules/echarts-for-react/')) return 'echarts-react';
          return undefined;
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4001',
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts'
  }
});
