import { describe, expect, it } from "vitest";
import {
  addDays,
  buildTimelineDates,
  differenceInDays,
  getTaskDateRange,
  shiftTaskDateRange,
} from "@/lib/gantt-utils";
import { initialTasks } from "@/lib/demo-data";

describe("gantt utils", () => {
  it("normaliza rangos y conserva su duración al reprogramar", () => {
    expect(
      getTaskDateRange({
        startDate: "2026-07-21",
        dueDate: "2026-07-24",
      }),
    ).toEqual({
      startDate: "2026-07-21",
      dueDate: "2026-07-24",
      durationDays: 4,
    });
    expect(
      shiftTaskDateRange(
        { startDate: "2026-07-21", dueDate: "2026-07-24" },
        "2026-08-03",
      ),
    ).toEqual({
      startDate: "2026-08-03",
      dueDate: "2026-08-06",
    });
  });

  it("construye un cronograma con margen e incluye subtareas", () => {
    const dates = buildTimelineDates(
      initialTasks,
      new Date("2026-07-24T12:00:00-03:00"),
    );
    expect(dates).toContain("2026-07-18");
    expect(dates).toContain("2026-07-30");
    expect(differenceInDays(dates[0], dates.at(-1)!)).toBeGreaterThan(10);
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(
      getTaskDateRange(
        initialTasks.find((task) => task.id === "subtask-2")!,
      ),
    ).not.toBeNull();
  });
});
