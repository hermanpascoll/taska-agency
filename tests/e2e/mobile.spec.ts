import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("conserva la estructura accesible en pantallas pequeñas", async ({
  page,
}) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag21a"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("mantiene navegables las tareas y el detalle en pantallas táctiles", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: /Buenos días/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegación móvil" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Tareas", exact: true }).click();
  await page
    .getByRole("button", {
      name: /AG-142.*Adaptar campaña/,
    })
    .click();

  const detail = page.getByTestId("task-detail");
  await expect(detail).toBeVisible();
  await expect(detail.getByLabel("Título de la tarea")).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Iniciar timer de esta tarea" }),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Cerrar", exact: true })
    .last()
    .click();
  await expect(detail).toBeHidden();
});

test("crea una tarea con el formulario desplazable", async ({ page }) => {
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.getByLabel("Nombre de la tarea").fill("Tarea móvil E2E");
  await page.getByLabel("Descripción", { exact: true }).fill(
    "Creada desde una pantalla táctil.",
  );
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByLabel("Título de la tarea")).toHaveValue(
    "Tarea móvil E2E",
  );
});
