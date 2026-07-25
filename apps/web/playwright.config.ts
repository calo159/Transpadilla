import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env["PORT"] ?? 8080);
const baseURL = process.env["BASE_URL"] ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: 1,
  reporter: process.env["CI"] ? "github" : "list",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env["BASE_URL"]
    ? undefined
    : {
        command: "pnpm --filter @workspace/api run dev",
        url: `http://localhost:8080/api/healthz`,
        reuseExistingServer: !process.env["CI"],
        timeout: 60_000,
      },
});
