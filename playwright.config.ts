import { defineConfig, devices } from "@playwright/test";

// E2E tests run against the shared dev server (mock AI via LLM_PROVIDER=mock in .env.local).
// If nothing is listening on the port, Playwright starts one itself.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Always use the offline mock AI in tests, even when a real API key is configured.
    extraHTTPHeaders: { "x-floor-mock": "1" },
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The bundled Chromium revision may not be downloaded; use the installed Google Chrome.
        channel: "chrome",
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `bun run dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { LLM_PROVIDER: "mock" },
  },
});
