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
    .getByLabel("Descripción", { exact: true })
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

test("crea la tarea dentro del proyecto seleccionado", async ({ page }) => {
  await page.getByRole("button", { name: "Marca Sur", exact: true }).click();
  await page.getByRole("button", { name: "Nueva tarea" }).click();

  await expect(page.getByLabel("Proyecto principal")).toHaveValue(
    "marca-sur",
  );
  await expect(
    page.getByRole("checkbox", { name: "Marca Sur" }),
  ).toBeChecked();

  await page
    .getByLabel("Nombre de la tarea")
    .fill("Preparar presentación de identidad");
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByLabel("Título de la tarea")).toHaveValue(
    "Preparar presentación de identidad",
  );

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem("taska-demo-workspace-v2");
        if (!raw) return null;
        const snapshot = JSON.parse(raw) as {
          tasks: Array<{
            title: string;
            project: { id: string };
            projects: Array<{ id: string }>;
          }>;
        };
        const task = snapshot.tasks.find(
          (item) => item.title === "Preparar presentación de identidad",
        );
        return task
          ? {
              primary: task.project.id,
              linked: task.projects.map((project) => project.id),
            }
          : null;
      }),
    )
    .toEqual({ primary: "marca-sur", linked: ["marca-sur"] });
});

test("muestra el proyecto como espacio de trabajo con detalle flotante", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Lanzamiento Aura", exact: true })
    .click();

  const workspace = page.getByTestId("project-workspace");
  await expect(workspace).toBeVisible();
  await expect(
    workspace.getByRole("heading", { name: "Lanzamiento Aura" }),
  ).toBeVisible();
  await expect(
    workspace.getByRole("navigation", { name: "Vistas del proyecto" }),
  ).toContainText("ResumenListaTableroCronogramaPanelGantt");
  await expect(page.getByTestId("project-task-list")).toBeVisible();

  await page
    .getByRole("article")
    .filter({ hasText: "Adaptar campaña de lanzamiento a stories" })
    .getByText("Diego", { exact: true })
    .click();

  await expect(page.getByTestId("task-detail")).toBeVisible();
  await expect(workspace).toBeVisible();
  await expect(page.getByTestId("task-description-document")).toBeVisible();
});

test("embebe una imagen en la descripción al crear la tarea", async ({
  page,
}) => {
  const pixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page
    .getByLabel("Nombre de la tarea")
    .fill("Revisar visual embebido");
  await page
    .getByLabel("Descripción", { exact: true })
    .fill("Referencia visual para revisar con el equipo.");
  await page
    .getByLabel("Seleccionar archivos para la descripción")
    .setInputFiles({
      name: "referencia-asana.png",
      mimeType: "image/png",
      buffer: pixelPng,
    });

  await expect(
    page.getByRole("img", {
      name: "Vista previa de referencia-asana.png",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Crear tarea" }).click();

  await expect(page.getByLabel("Título de la tarea")).toHaveValue(
    "Revisar visual embebido",
  );
  await expect(
    page.getByRole("img", {
      name: "Adjunto embebido referencia-asana.png",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("task-description-document")
      .getByRole("img", {
        name: "Adjunto embebido referencia-asana.png",
      }),
  ).toBeVisible();
  await expect(
    page.getByText("Tarea creada correctamente · 1 archivo embebido"),
  ).toBeVisible();

  const descriptionDocument = page.getByTestId(
    "task-description-document",
  );
  const descriptionField = descriptionDocument.getByLabel(
    "Descripción de la tarea",
  );
  await descriptionField.fill("Texto antesTexto después");
  await descriptionField.press("Home");
  for (let index = 0; index < 11; index += 1) {
    await descriptionField.press("ArrowRight");
  }
  await descriptionDocument
    .getByLabel("Seleccionar archivos para la tarea")
    .setInputFiles({
      name: "referencia-intermedia.png",
      mimeType: "image/png",
      buffer: pixelPng,
    });

  await expect(
    descriptionDocument.getByRole("img", {
      name: "Adjunto embebido referencia-intermedia.png",
    }),
  ).toBeVisible();
  await expect(
    descriptionDocument.getByLabel("Descripción de la tarea").nth(0),
  ).toHaveValue("Texto antes");
  await expect(
    descriptionDocument.getByLabel("Descripción de la tarea").nth(1),
  ).toHaveValue("Texto después");
});

test("adjunta varios archivos desde la descripción de la tarea", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Todas las tareas" }).click();
  await page
    .getByRole("button", {
      name: /AG-147 Verano Brava Cerrar copies/,
    })
    .click();

  await page.getByLabel("Seleccionar archivos para la tarea").setInputFiles([
    {
      name: "brief-invierno.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Brief de campaña de invierno"),
    },
    {
      name: "referencias-visuales.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Referencias para el equipo creativo"),
    },
  ]);

  const descriptionAttachments = page.getByTestId(
    "task-description-document",
  );
  await expect(
    descriptionAttachments.getByText("brief-invierno.txt"),
  ).toBeVisible();
  await expect(
    descriptionAttachments.getByText("referencias-visuales.txt"),
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

test("reagenda una tarea recurrente con sus subtareas", async ({ page }) => {
  await page.getByRole("button", { name: "Todas las tareas" }).click();
  await page
    .getByRole("button", {
      name: /AG-142 Lanzamiento Aura Adaptar campaña/,
    })
    .click();
  await expect(page.getByLabel("Repetición de la tarea")).toHaveValue(
    "weekly",
  );
  await page.getByRole("button", { name: "Marcar aprobada" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem("taska-demo-workspace-v2");
        if (!raw) return null;
        const snapshot = JSON.parse(raw) as {
          tasks: Array<{
            id: string;
            parentTaskId: string | null;
            recurrenceOriginId?: string | null;
            dueDate: string | null;
          }>;
        };
        const occurrence = snapshot.tasks.find(
          (task) =>
            task.parentTaskId === null &&
            task.recurrenceOriginId === "task-1",
        );
        if (!occurrence) return null;
        const clonedSubtasks = snapshot.tasks.filter(
          (task) => task.parentTaskId === occurrence.id,
        );
        return {
          dueDate: occurrence.dueDate,
          subtasks: clonedSubtasks.length,
        };
      }),
    )
    .toEqual({ dueDate: "2026-07-31", subtasks: 2 });
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

test("activa y conserva el modo oscuro", async ({ page }) => {
  await page.getByRole("button", { name: "Abrir menú de perfil" }).click();
  await page
    .getByRole("button", { name: "Mi perfil y apariencia" })
    .click();

  const darkMode = page.getByRole("switch", { name: "Modo oscuro" });
  await expect(darkMode).toHaveAttribute("aria-checked", "false");
  await darkMode.click();
  await expect(darkMode).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Cerrar configuración" }).click();
  await page.reload();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("taska-theme")),
    )
    .toBe("dark");
});

test("crea clientes y vincula una tarea a varios proyectos", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Clientes" }).click();
  await page.getByPlaceholder("Ej. Aura Cosmética").fill("Cliente E2E");
  await page
    .getByPlaceholder("Institucional, Cartelería, Autoliquidables")
    .fill("Institucional, Cartelería, Autoliquidables");
  await page
    .getByPlaceholder("marketing@cliente.com")
    .fill("cliente@taska.test");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("heading", { name: "Cliente E2E" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar clientes" }).click();

  await page.getByRole("button", { name: "Crear proyecto" }).last().click();
  await page.getByLabel("Nombre del proyecto").fill("Proyecto Cliente E2E");
  await page.getByLabel("Cliente").selectOption({ label: "Cliente E2E" });
  await page
    .getByLabel("Categoría / servicio")
    .selectOption("Cartelería");
  await page.getByRole("button", { name: "Crear proyecto" }).last().click();
  await expect(
    page.getByRole("button", { name: "Proyecto Cliente E2E", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.getByLabel("Nombre de la tarea").fill("Tarea multiproyecto E2E");
  await page
    .getByText("Campaña", { exact: true })
    .locator("..")
    .getByRole("combobox")
    .selectOption({ label: "Proyecto Cliente E2E" });
  const projectCheckboxes = page.getByRole("checkbox");
  await projectCheckboxes.first().check();
  await page.getByLabel("Hora de entrega").fill("16:45");
  await page.getByLabel("Repetición").selectOption("weekly");
  await page
    .getByPlaceholder("Ej. Diseño, Cartelería, Cambio de cliente")
    .fill("Diseño, Aprobación");
  await page.getByRole("button", { name: "Crear tarea" }).click();

  await expect(page.getByLabel("Título de la tarea")).toHaveValue(
    "Tarea multiproyecto E2E",
  );
  await page
    .locator("summary")
    .filter({ hasText: "Detalles" })
    .click();
  await expect(
    page.getByLabel("Cliente de la tarea").locator("option:checked"),
  ).toHaveText("Cliente E2E");
  await expect(page.getByLabel("Categoría del cliente")).toHaveValue(
    "Cartelería",
  );
  await expect(page.getByLabel("Hora de vencimiento")).toHaveValue("16:45");
  await expect(page.getByLabel("Repetición de la tarea")).toHaveValue(
    "weekly",
  );
  await expect(page.getByLabel("Etiquetas de la tarea")).toHaveValue(
    "Diseño, Aprobación",
  );
  await page
    .locator("summary")
    .filter({ hasText: "Tiempo, proceso e historial" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resumen de actividad" }),
  ).toBeVisible();
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
    .locator("summary")
    .filter({ hasText: "Tiempo, proceso e historial" })
    .click();
  await page
    .getByPlaceholder("¿En qué estás trabajando?")
    .fill("Revisión visual automatizada");
  await page.getByRole("button", { name: "Iniciar timer" }).click();
  await expect(
    page.getByRole("button", { name: "Timers activos: 1" }),
  ).toBeVisible();
  await page.waitForTimeout(1100);
  await page
    .getByRole("button", { name: "Detener timer de la tarea" })
    .click();
  await expect(
    page.getByRole("button", { name: "Timers activos: 0" }),
  ).toBeVisible();
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

test("resume y controla varios timers activos desde el encabezado", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Todas las tareas" }).click();
  await page
    .getByRole("button", {
      name: /AG-142 Lanzamiento Aura Adaptar campaña/,
    })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Tiempo, proceso e historial" })
    .click();
  await page
    .getByPlaceholder("¿En qué estás trabajando?")
    .fill("Dirección creativa");
  await page.getByRole("button", { name: "Iniciar timer" }).click();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page
    .getByRole("button", {
      name: /AG-140 Marca Sur Entregar propuesta/,
    })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Tiempo, proceso e historial" })
    .click();
  await page
    .getByPlaceholder("¿En qué estás trabajando?")
    .fill("Presentación al cliente");
  await page.getByRole("button", { name: "Iniciar timer" }).click();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.getByRole("button", { name: "Timers activos: 2" }).click();
  const menu = page.getByTestId("active-timers-menu");
  await expect(menu).toBeVisible();
  await expect(
    menu.getByText("Adaptar campaña de lanzamiento a stories"),
  ).toBeVisible();
  await expect(menu.getByText("Entregar propuesta de rebranding")).toBeVisible();
  await expect(menu.getByText("Dirección creativa")).toBeVisible();
  await expect(menu.getByText("Presentación al cliente")).toBeVisible();

  await menu
    .getByRole("button", {
      name: "Detener timer de Adaptar campaña de lanzamiento a stories",
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Timers activos: 1" }),
  ).toBeVisible();
  await menu
    .getByRole("button", {
      name: "Detener timer de Entregar propuesta de rebranding",
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Timers activos: 0" }),
  ).toBeVisible();
});

test("crea, documenta, archiva y restaura un expediente de proceso", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page
    .getByLabel("Plantilla de proceso")
    .selectOption("campaign");
  await page
    .getByLabel("Nombre de la tarea")
    .fill("Campaña documentada E2E");
  await page.getByRole("button", { name: "Crear tarea" }).click();

  await expect(page).toHaveURL(/\?task=/);
  await expect(page.getByText("0/5 completas")).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "Tiempo, proceso e historial" })
    .click();
  await page
    .getByLabel("Objetivo")
    .fill("Conservar el antecedente completo de la campaña");
  await page.getByLabel("Objetivo").press("Tab");
  await expect(page.getByTestId("task-last-edited")).toContainText(
    "Editado por",
  );

  await page.getByPlaceholder("Nueva subtarea…").fill("Control legal E2E");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByText("0/6 completas")).toBeVisible();

  await page.getByLabel("Tipo de comentario").selectOption("decision");
  await page
    .getByPlaceholder("Sumá feedback o una actualización…")
    .fill("Se aprobó la ruta visual número dos.");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(
    page.getByText("Se aprobó la ruta visual número dos."),
  ).toBeVisible();

  const activityHistory = page.getByTestId("process-activity-history");
  await expect(activityHistory.getByText("Historial del proceso")).toBeVisible();
  await activityHistory
    .getByRole("button", { name: "Mostrar historial del proceso" })
    .click();
  await activityHistory
    .getByRole("button", { name: "Filtrar historial: Tareas" })
    .click();
  await expect(activityHistory.getByText("Control legal E2E")).toBeVisible();
  await activityHistory
    .getByRole("button", { name: "Filtrar historial: Comentarios" })
    .click();
  await expect(
    activityHistory.getByText("Se aprobó la ruta visual número dos."),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Cerrar y archivar expediente" })
    .click();
  await page
    .getByLabel("Conclusión del proceso")
    .fill("Se entregaron originales aprobados y adaptaciones.");
  await page
    .getByLabel("Aprendizajes o decisiones reutilizables")
    .fill("Presentar siempre dos rutas visuales.");
  await page
    .getByRole("button", { name: "Archivar expediente", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Archivo de procesos" }),
  ).toBeVisible();
  await expect(page.getByText("Campaña documentada E2E")).toBeVisible();
  await page.getByRole("button", { name: "Abrir", exact: true }).click();
  const archivedDrawer = page.getByTestId("archived-task-drawer");
  await expect(
    archivedDrawer.getByRole("button", { name: "Restaurar", exact: true }),
  ).toBeVisible();
  await expect(
    archivedDrawer.getByText(
      "Se entregaron originales aprobados y adaptaciones.",
    ),
  ).toBeVisible();
  await expect(archivedDrawer.getByText("Historial del proceso")).toBeVisible();

  await archivedDrawer
    .getByRole("button", { name: "Restaurar", exact: true })
    .click();
  await page.getByRole("button", { name: "Todas las tareas" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Campaña documentada E2E",
      level: 3,
    }),
  ).toBeVisible();
});
