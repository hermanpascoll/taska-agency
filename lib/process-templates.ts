import type { TaskBrief, TaskPriority } from "@/lib/types";

export type ProcessTemplate = {
  id: string;
  name: string;
  description: string;
  priority: TaskPriority;
  tags: string[];
  brief: TaskBrief;
  steps: string[];
};

export const processTemplates: ProcessTemplate[] = [
  {
    id: "campaign",
    name: "Campaña publicitaria",
    description:
      "Del brief inicial a la aprobación, producción y entrega de originales.",
    priority: "alta",
    tags: ["Campaña", "Producción"],
    brief: {
      deliverables: "Concepto, key visual, adaptaciones y originales finales",
    },
    steps: [
      "Validar brief y alcance",
      "Desarrollar concepto y propuesta creativa",
      "Producir piezas y adaptaciones",
      "Consolidar feedback y ajustes",
      "Aprobar y entregar originales finales",
    ],
  },
  {
    id: "social",
    name: "Pieza para redes",
    description:
      "Flujo corto de copy, diseño, revisión y publicación para contenido social.",
    priority: "media",
    tags: ["Social", "Contenido"],
    brief: {
      deliverables: "Copy, arte aprobado y archivo final de publicación",
    },
    steps: [
      "Definir objetivo, formato y mensaje",
      "Redactar copy",
      "Diseñar pieza",
      "Revisar y ajustar",
      "Aprobar y programar publicación",
    ],
  },
  {
    id: "monthly_calendar",
    name: "Calendario mensual",
    description:
      "Planificación, producción y aprobación del calendario de contenidos.",
    priority: "media",
    tags: ["Calendario", "Always-on"],
    brief: {
      deliverables: "Grilla mensual, copies, piezas y calendario aprobado",
    },
    steps: [
      "Definir pilares y fechas relevantes",
      "Preparar grilla y copies",
      "Diseñar piezas",
      "Enviar calendario al cliente",
      "Aplicar cambios y cerrar aprobación",
    ],
  },
  {
    id: "branding",
    name: "Branding o identidad",
    description:
      "Proceso de investigación, rutas visuales, desarrollo y manual final.",
    priority: "alta",
    tags: ["Branding", "Identidad"],
    brief: {
      deliverables: "Rutas conceptuales, identidad aprobada y manual de marca",
    },
    steps: [
      "Relevar contexto y competencia",
      "Definir estrategia y territorio",
      "Diseñar rutas visuales",
      "Desarrollar identidad seleccionada",
      "Preparar manual y archivos finales",
    ],
  },
  {
    id: "event",
    name: "Evento o activación",
    description:
      "Coordinación integral de concepto, producción, proveedores y cierre.",
    priority: "alta",
    tags: ["Evento", "Producción"],
    brief: {
      deliverables: "Plan de evento, piezas, producción y reporte de cierre",
    },
    steps: [
      "Confirmar alcance, fecha y presupuesto",
      "Definir concepto y experiencia",
      "Coordinar proveedores y producción",
      "Validar piezas y logística",
      "Ejecutar y documentar cierre",
    ],
  },
];

export function findProcessTemplate(templateId?: string) {
  return processTemplates.find((template) => template.id === templateId);
}

