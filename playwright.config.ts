import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://127.0.0.1:${PORT}`;

// Optional local override for a preinstalled Chromium whose revision differs from
// the one bundled with @playwright/test. CI never sets this and uses the installed browser.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'no-preference' } },
    },
    {
      name: 'chromium-reduced-motion',
      use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'reduce' } },
    },
  ],
  // Serves the already-built dist/ (run `pnpm build` first; CI downloads it from the verify job).
  // `--ignore-lock` keeps `astro preview` in the foreground (Astro auto-backgrounds it when it
  // detects a coding agent), so Playwright owns the server and stops it after the run.
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
