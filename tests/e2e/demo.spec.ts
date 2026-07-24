import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("crea una tarea y conserva el cambio al recargar", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: /Buenos días/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.getByLabel("Nombre de la tarea").fill("Revisar home Apple");
  await page
    .getByLabel("Descripción")
    .fill("Validar jerarquía, espaciado y estados del Finder.");
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByLabel("Título de la tarea")).toHaveValue(
    "Revisar home Apple",
  );
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage
          .getItem("taska-demo-workspace-v2")
          ?.includes("Revisar home Apple"),
      ),
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Todas las tareas" }).click();
  await expect(
    page
      .getByRole("heading", { name: "Revisar home Apple", level: 3 })
      .first(),
  ).toBeVisible();
});

test("mueve una tarjeta con drag-and-drop real", async ({ page }) => {
  await page.getByRole("button", { name: "Todas las tareas" }).click();
  await page.getByRole("button", { name: "Tablero" }).last().click();
  const card = page.getByTestId("kanban-card-task-1");
  const target = page.getByTestId("kanban-column-esperando");
  await expect(card).toBeVisible();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await card.dispatchEvent("dragend", { dataTransfer });
  await expect(
    target.getByText("AG-142"),
  ).toBeVisible();
});

test("muestra subtareas asignadas en Mis tareas y en Gantt", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", {
      name: "Revisar safe areas para stories",
      level: 3,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Subtarea de Adaptar campaña/).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Cronograma" }).click();
  await expect(page.getByTestId("gantt-chart")).toBeVisible();
  await expect(page.getByTestId("gantt-row-subtask-2")).toBeVisible();
  await expect(page.getByTestId("gantt-bar-subtask-2")).toBeVisible();

  const timeline = page.getByTestId("gantt-timeline");
  const timelineBox = await timeline.boundingBox();
  expect(timelineBox).not.toBeNull();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const bar = page.getByTestId("gantt-bar-subtask-2");
  await bar.dispatchEvent("dragstart", { dataTransfer });
  await timeline.dispatchEvent("dragover", {
    clientX: timelineBox!.x + 6 * 22,
    dataTransfer,
  });
  await timeline.dispatchEvent("drop", {
    clientX: timelineBox!.x + 6 * 22,
    dataTransfer,
  });
  await bar.dispatchEvent("dragend", { dataTransfer });
  await expect(page.getByTestId("gantt-row-subtask-2")).toContainText(
    "21 jul. – 22 jul.",
  );
});

test("administra integrantes e invitaciones desde Preferencias", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Abrir menú de perfil" }).click();
  await page
    .getByRole("button", { name: "Mi perfil y apariencia" })
    .click();
  await page.getByRole("button", { name: "Integrantes" }).click();
  await page.getByPlaceholder("persona@empresa.com").fill("nuevo@taska.test");
  await page.getByRole("button", { name: "Invitar" }).click();
  await expect(page.getByText("nuevo@taska.test")).toBeVisible();
  await expect(page.getByText("Invitaciones pendientes")).toBeVisible();
});

test("crea clientes y vincula una tarea a varios proyectos", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Clientes" }).click();
  await page.getByPlaceholder("Ej. Aura Cosmética").fill("Cliente E2E");
  await page
    .getByPlaceholder("marketing@cliente.com")
    .fill("cliente@taska.test");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("heading", { name: "Cliente E2E" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar clientes" }).click();

  await page.getByRole("button", { name: "Crear proyecto" }).last().click();
  await page.getByLabel("Nombre del proyecto").fill("Proyecto Cliente E2E");
  await page.getByLabel("Cliente").selectOption({ label: "Cliente E2E" });
  await page.getByRole("button", { name: "Crear proyecto" }).last().click();
  await expect(
    page.getByRole("button", { name: "Proyecto Cliente E2E", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.getByLabel("Nombre de la tarea").fill("Tarea multiproyecto E2E");
  await page.getByLabel("Campaña").selectOption({
    label: "Proyecto Cliente E2E",
  });
  const projectCheckboxes = page.getByRole("checkbox");
  await projectCheckboxes.first().check();
  await page.getByRole("button", { name: "Crear tarea" }).click();

  await expect(page.getByLabel("Título de la tarea")).toHaveValue(
    "Tarea multiproyecto E2E",
  );
  await expect(page.getByText("Cliente E2E", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Lanzamiento Aura" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Proyecto Cliente E2E" }),
  ).toBeChecked();
});

test("registra tiempo y exporta la auditoría con permisos", async ({ page }) => {
  await page.getByRole("button", { name: "Todas las tareas" }).click();
  await page
    .getByRole("button", {
      name: /AG-142 Lanzamiento Aura Adaptar campaña/,
    })
    .click();
  await page
    .getByPlaceholder("¿En qué estás trabajando?")
    .fill("Revisión visual automatizada");
  await page.getByRole("button", { name: "Iniciar timer" }).click();
  await expect(
    page.getByRole("button", { name: "Detener timer activo" }),
  ).toBeVisible();
  await page.waitForTimeout(1100);
  await page
    .getByRole("button", { name: "Detener timer de la tarea" })
    .click();
  await expect(page.getByText("2 registros")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.getByRole("button", { name: "Reportes de tiempo" }).click();
  await expect(
    page.getByRole("heading", { name: "Auditoría de tiempo y costos" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^taska-tiempo-.*\.csv$/);
});
