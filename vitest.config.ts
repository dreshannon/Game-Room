import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so rules tests don't start the Cloudflare runtime.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})
