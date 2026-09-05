import { describe, expect, test } from "bun:test";
import * as Progress from "../src";
import { makeTaskSnapshot, makeRow as deriveRow, renderRows } from "./helpers/renderer";

const makeTask = (
  id: number,
  description: string,
  countDisplay: Progress.TaskCountDisplay,
  units: Progress.TaskSnapshot["units"],
): Progress.TaskSnapshot =>
  makeTaskSnapshot({
    id: Progress.TaskId(id),
    description,
    countDisplay,
    units,
    status: units.total !== undefined && units.processed < units.total ? "failed" : "done",
    completedAt: 1_000,
    progressSamples: [
      { timestamp: 0, processed: 0 },
      { timestamp: 1_000, processed: units.processed },
    ],
  });

describe("renderer progress columns", () => {
  test("renders amount values for all rows", () => {
    const output = renderRows([
      deriveRow(
        makeTask(1, "fail-fast", "processedOnly", {
          succeeded: 3,
          failed: 0,
          processed: 3,
          total: 4,
        }),
      ),
      deriveRow(
        makeTask(2, "collect-all", "detailed", {
          succeeded: 3,
          failed: 1,
          processed: 4,
          total: 4,
        }),
      ),
    ]);

    expect(output).toContain("3/4");
    expect(output).toContain("4/4");
  });

  test("renders amounts with consistent formatting across rows", () => {
    const output = renderRows([
      deriveRow(
        makeTask(1, "all-succeeded", "detailed", {
          succeeded: 3,
          failed: 0,
          processed: 3,
          total: 3,
        }),
      ),
      deriveRow(
        makeTask(2, "all-failed__", "detailed", {
          succeeded: 0,
          failed: 3,
          processed: 3,
          total: 3,
        }),
      ),
      deriveRow(
        makeTask(3, "manual-mix__", "detailed", {
          succeeded: 8,
          failed: 2,
          processed: 10,
          total: 10,
        }),
      ),
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
