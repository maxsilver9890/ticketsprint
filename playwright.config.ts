import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.TEST_API_PORT ?? "4000";
const webPort = process.env.TEST_WEB_PORT ?? "3000";
const webOrigin = `http://localhost:${webPort}`;
const apiOrigin = `http://localhost:${apiPort}`;
const env = {
  NODE_ENV: "test",
  API_PORT: apiPort,
  WEB_ORIGIN: webOrigin,
  NEXT_PUBLIC_API_URL: `${apiOrigin}/api/v1`,
  NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-e2e",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "pnpm --filter @ticketsprint/api dev",
      url: `${apiOrigin}/api/v1/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env,
    },
    {
      command:
        process.env.TEST_WEB_MODE === "start"
          ? `pnpm --filter @ticketsprint/web exec next start --hostname 0.0.0.0 --port ${webPort}`
          : `pnpm --filter @ticketsprint/web exec next dev --hostname 0.0.0.0 --port ${webPort}`,
      url: `${webOrigin}/register`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env,
    },
  ],
});
