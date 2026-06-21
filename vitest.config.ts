import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Test harness for the pricing module (see PRICING-HARNESS-PLAN.md).
// Node environment — these are pure-logic + mocked-DB tests, no DOM needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/__tests__/**/*.test.ts'],
    // Determinism is part of what we assert; keep timers/dates real but stable.
    clearMocks: true,
  },
  resolve: {
    alias: {
      // Mirror tsconfig "@/*" -> repo root
      '@': path.resolve(__dirname, '.'),
    },
  },
})
