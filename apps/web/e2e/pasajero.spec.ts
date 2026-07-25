import { test, expect } from "@playwright/test";

const DEMO_USER = process.env["E2E_USER_EMAIL"];
const DEMO_PASS = process.env["E2E_USER_PASSWORD"];

test.describe("Pasajero", () => {
  test("carga el mapa en la pagina principal", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
  });

  test("muestra la barra superior con logo TransPadilla", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText("TransPadilla", { timeout: 10_000 });
  });

  test("muestra el boton de ubicacion", async ({ page }) => {
    await page.goto("/");
    const btn = page.getByLabel(/Centrar en mi ubicaci/);
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("navega a la pagina de login", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/login/);
  });

  test("pagina de privacidad es accesible", async ({ page }) => {
    await page.goto("/privacidad");
    await expect(page.locator("body")).toContainText(/privacidad|habeas data/i, {
      timeout: 10_000,
    });
  });

  test("pagina de terminos es accesible", async ({ page }) => {
    await page.goto("/terminos");
    await expect(page.locator("body")).toContainText(/términos|conditions/i, {
      timeout: 10_000,
    });
  });
});

test.describe("Login", () => {
  test("muestra el formulario de login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("input-password")).toBeVisible({ timeout: 10_000 });
  });

  test("credenciales invalidas muestra error", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder(/correo/i).fill("noexiste@test.com");
    await page.getByTestId("input-password").fill("wrongpassword123!");
    await page.getByRole("button", { name: /iniciar|login|entrar/i }).click();

    await expect(page.locator("body")).toContainText(/incorrectos?|inv.lid|credenciales/i, {
      timeout: 10_000,
    });
  });

  test.skip(!DEMO_USER, "requiere E2E_USER_EMAIL y E2E_USER_PASSWORD");

  test("login exitoso redirige segun rol", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder(/correo/i).fill(DEMO_USER!);
    await page.getByTestId("input-password").fill(DEMO_PASS!);
    await page.getByRole("button", { name: /iniciar|login|entrar/i }).click();
    await expect(page).not.toHaveURL(/login/, { timeout: 15_000 });
  });
});

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
