import { defineConfig } from 'vitest/config'

// For one-off scripts like the Mascot Mayhem simulator, kept out of the normal test run.
export default defineConfig({ test: { include: ['scripts/**/simulate-*.ts'] } })
