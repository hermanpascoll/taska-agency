import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("no presenta infracciones críticas de accesibilidad", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag21a"])
    .analyze();
  expect(
    results.violations,
    results.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(" "))
            .join(", ")}`,
      )
      .join("\n"),
  ).toEqual([]);
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

test("muestra el proyecto como espacio de trabajo con detalle dividido", async ({
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
  ).toContainText(
    "ResumenListaTableroCalendarioCronogramaGanttPanelFlujo de trabajoMensajesArchivos",
  );
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

test("navega el calendario mensual y muestra indicadores del proyecto", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Lanzamiento Aura", exact: true })
    .click();

  await page.getByRole("button", { name: "Calendario", exact: true }).click();
  const calendar = page.getByTestId("project-calendar");
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole("button", { name: "Mes anterior" })).toBeVisible();
  await expect(calendar.getByRole("button", { name: "Mes siguiente" })).toBeVisible();
  await calendar.getByRole("button", { name: "Mes siguiente" }).click();
  await expect(calendar.getByRole("button", { name: "Hoy", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Panel", exact: true }).click();
  const dashboard = page.getByTestId("project-dashboard");
  await expect(dashboard).toContainText("Tareas por estado");
  await expect(dashboard).toContainText("Carga del equipo");
  await expect(dashboard).toContainText("Salud del proyecto");
});

test("crea y conserva portafolios y objetivos estratégicos", async ({ page }) => {
  await page.getByRole("button", { name: "Portafolios", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo portafolio", exact: true }).click();
  const portfolioDialog = page.getByRole("dialog", { name: "Nuevo portafolio" });
  await portfolioDialog.getByLabel("Nombre").fill("Campañas prioritarias E2E");
  await portfolioDialog.getByLabel("Descripción").fill("Seguimiento de entregas clave");
  await portfolioDialog.getByLabel("Lanzamiento Aura").check();
  await portfolioDialog.getByRole("button", { name: "Crear portafolio" }).click();
  await expect(page.getByRole("heading", { name: "Campañas prioritarias E2E" })).toBeVisible();

  await page.getByRole("button", { name: "Objetivos", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo objetivo", exact: true }).click();
  const goalDialog = page.getByRole("dialog", { name: "Nuevo objetivo" });
  await goalDialog.getByLabel("Nombre").fill("Entregar campañas en fecha E2E");
  await goalDialog.getByLabel("Descripción").fill("Reducir los desvíos del trimestre");
  await goalDialog.getByLabel("Lanzamiento Aura").check();
  await goalDialog.getByRole("button", { name: "Crear objetivo" }).click();
  await expect(page.getByRole("heading", { name: "Entregar campañas en fecha E2E" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Portafolios", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Campañas prioritarias E2E" })).toBeVisible();
  await page.getByRole("button", { name: "Objetivos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Entregar campañas en fecha E2E" })).toBeVisible();
});

test("ofrece un detalle de tarea con flujo tipo Asana y timer integrado", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Todas las tareas" }).click();
  await page
    .getByRole("button", {
      name: /AG-142 Lanzamiento Aura Adaptar campaña/,
    })
    .click();

  const detail = page.getByTestId("task-detail");
  await expect(detail.getByLabel("Título de la tarea")).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Compartir tarea" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Me gusta" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Copiar enlace de la tarea" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Iniciar timer de esta tarea" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: /Subtareas/ }),
  ).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: /Adjuntos/ }),
  ).toBeVisible();

  await detail
    .getByTestId("task-description-document")
    .getByRole("button", { name: "Editar documento" })
    .click();
  const descriptionDocument = detail.getByTestId(
    "task-description-document",
  );
  for (const command of [
    "Deshacer",
    "Rehacer",
    "Negrita",
    "Cursiva",
    "Subrayado",
    "Resaltar",
    "Tachado",
    "Lista con viñetas",
    "Lista numerada",
    "Lista de tareas",
    "Insertar enlace",
    "Código en línea",
    "Cita",
    "Crear tarea desde el texto seleccionado",
  ]) {
    await expect(
      descriptionDocument.getByRole("button", { name: command }),
    ).toBeVisible();
  }

  await detail
    .getByRole("button", { name: "Abrir en pantalla completa" })
    .click();
  await expect(
    detail.getByRole("button", { name: "Salir de pantalla completa" }),
  ).toBeVisible();

  await detail.getByRole("tab", { name: "Toda la actividad" }).click();
  await expect(detail.getByTestId("process-activity-history")).toBeVisible();
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
  await descriptionDocument
    .getByRole("button", { name: "Editar documento" })
    .click();
  const descriptionField = descriptionDocument
    .getByLabel("Descripción de la tarea")
    .first();
  await descriptionField.fill("Texto antesTexto después");
  await descriptionField.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(11, 11);
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
  });
  const fileChooserPromise = page.waitForEvent("filechooser");
  await descriptionDocument
    .getByRole("button", {
      name: "Insertar imagen o archivo en la descripción",
    })
    .click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
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
  await page.getByRole("button", { name: "Completar tarea" }).click();

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

  await page.getByRole("button", { name: "Gantt" }).first().click();
  await expect(page.getByTestId("gantt-chart")).toBeVisible();
  await expect(page.getByTestId("gantt-row-subtask-2")).toBeVisible();
  await expect(page.getByTestId("gantt-bar-subtask-2")).toBeVisible();

  const initialDateLabel = await page
    .getByTestId("gantt-row-subtask-2")
    .textContent();
  const bar = page.getByTestId("gantt-bar-subtask-2");
  await bar.focus();
  await bar.press("ArrowRight");
  await expect
    .poll(() => page.getByTestId("gantt-row-subtask-2").textContent())
    .not.toBe(initialDateLabel);
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

  const darkMode = page.getByRole("button", { name: "Oscuro" });
  await expect(darkMode).toHaveAttribute("aria-pressed", "false");
  await darkMode.click();
  await expect(darkMode).toHaveAttribute("aria-pressed", "true");
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
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
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
    .getByLabel("Proyecto principal")
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
  await page
    .getByRole("button", { name: "Iniciar timer", exact: true })
    .click();
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
  await page.getByRole("button", { name: "CSV", exact: true }).click();
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
  await page
    .getByRole("button", { name: "Iniciar timer", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Iniciar timer", exact: true })
    .click();
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
    .locator("summary")
    .filter({ hasText: "Usar una plantilla de proceso" })
    .click();
  await page
    .getByLabel("Plantilla de proceso")
    .selectOption("campaign");
  await page
    .getByLabel("Nombre de la tarea")
    .fill("Campaña documentada E2E");
  await page.getByRole("button", { name: "Crear tarea" }).click();

  await expect(page).toHaveURL(/\?task=/);
  await expect(page.getByText("0/5", { exact: true })).toBeVisible();
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
  await expect(page.getByText("0/6", { exact: true })).toBeVisible();

  await page
    .getByPlaceholder("Agregar un comentario")
    .fill("Se aprobó la ruta visual número dos.");
  await page.getByLabel("Tipo de comentario").selectOption("decision");
  await page
    .getByRole("button", { name: "Comentar", exact: true })
    .click();
  await expect(
    page.getByText("Se aprobó la ruta visual número dos."),
  ).toBeVisible();

  await page
    .getByRole("tab", { name: "Toda la actividad" })
    .click();
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
    .getByRole("button", { name: "Más acciones de la tarea" })
    .click();
  await page
    .getByRole("button", { name: "Archivar expediente" })
    .click();
  await page
    .getByLabel("Conclusión del proceso")
    .fill("Se entregaron originales aprobados y adaptaciones.");
  await page
    .getByLabel("Aprendizajes o decisiones reutilizables")
    .fill("Presentar siempre dos rutas visuales.");
  await page
    .getByRole("dialog", { name: /Cerrar y archivar/ })
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
