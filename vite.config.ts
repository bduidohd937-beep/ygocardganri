import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/ygocardganri/' : '/',
  plugins: [react()],
  optimizeDeps: { include: ['sql.js','jszip','luaparse'] },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});