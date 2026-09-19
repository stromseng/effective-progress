import { describe, expect, test } from "bun:test";
import * as Progress from "../../src";
import { makeTaskSnapshot, makeRow as deriveRow, renderRows } from "../helpers/renderer";

describe("amount column", () => {
  test("renders amount values for all rows", () => {
    const output = renderRows([
      deriveRow(
        makeTaskSnapshot({
          id: Progress.TaskId(1),
          description: "fail-fast",
          countDisplay: "processedOnly",
          status: "failed",
          completedAt: 1_000,
          units: { succeeded: 3, failed: 0, processed: 3, total: 4 },
        }),
      ),
      deriveRow(
        makeTaskSnapshot({
          id: Progress.TaskId(2),
          description: "collect-all",
          countDisplay: "detailed",
          status: "done",
          completedAt: 1_000,
          units: { succeeded: 3, failed: 1, processed: 4, total: 4 },
        }),
      ),
    ]);

    expect(output).toContain("3/4");
    expect(output).toContain("4/4");
  });

  test("renders amounts with consistent formatting across rows", () => {
    const finished = (id: number, description: string, units: Progress.TaskUnits) =>
      makeTaskSnapshot({
        id: Progress.TaskId(id),
        description,
        countDisplay: "detailed",
        status: "done",
        completedAt: 1_000,
        units,
      });
    const output = renderRows([
      deriveRow(finished(1, "all-succeeded", { succeeded: 3, failed: 0, processed: 3, total: 3 })),
      deriveRow(finished(2, "all-failed__", { succeeded: 0, failed: 3, processed: 3, total: 3 })),
      deriveRow(finished(3, "manual-mix__", { succeeded: 8, failed: 2, processed: 10, total: 10 })),
    ]);

    const lines = output
      .split("\n")
      .filter(
        (line) =>
          line.includes("all-succeeded") ||
          line.includes("all-failed__") ||
          line.includes("manual-mix__"),
      );

    expect(lines.length).toBe(3);
    for (const line of lines) {
      expect(line).toContain("/");
    }
  });
});
