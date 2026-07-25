import { test, expect } from "@playwright/test";

test.describe("Conductor", () => {
  test("redirige a login si no hay sesion", async ({ page }) => {
    await page.goto("/conductor");
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});

test.describe("Admin", () => {
  test("redirige a login si no hay sesion", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
