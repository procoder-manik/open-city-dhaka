import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // Software-rendered WebGPU is CPU-heavy; parallel browsers starve each other.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Software GPU: works on CI machines without a GPU and lets screenshots capture WebGPU.
    launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 915, height: 412 } } },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Never touch the real (Neon) database from tests: an empty DATABASE_URL beats .env.local
    // and makes the app use the embedded PGlite DB; auth URL must match the test port.
    env: {
      DATABASE_URL: '',
      PGLITE_DIR: '.data/pglite-e2e',
      AUTH_RATE_LIMIT: 'off',
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
    },
  },
});
