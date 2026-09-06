import { describe, expect, test } from "bun:test";
import * as Progress from "../../src";
import { makeTaskSnapshot, makeRow as deriveRow, renderRows } from "../helpers/renderer";

const makeTask = (overrides: Partial<Progress.TaskSnapshot> = {}): Progress.TaskSnapshot =>
  makeTaskSnapshot({ description: "eta-task", ...overrides });

const renderTaskWithEta = (task: Progress.TaskSnapshot, now: number): string =>
  renderRows([deriveRow(task)], {
    now,
    columns: new Map([[task.id, [Progress.Columns.description(), Progress.Columns.eta()]]]),
  });

const renderWithEta = (now: number): string => renderTaskWithEta(makeTask(), now);

describe("renderer eta column", () => {
  test("renders prefixed eta when task has progress", () => {
    const output = renderWithEta(1_000);
    expect(output).toContain("ETA: 00:01");
  });

  test("does not render ETA for completed tasks", () => {
    const completedTask = makeTask({
      description: "done-task",
      status: "done",
      units: { succeeded: 2, failed: 0, processed: 2, total: 2 },
      completedAt: 1_000,
      progressSamples: [
        { timestamp: 0, processed: 0 },
        { timestamp: 1_000, processed: 2 },
      ],
    });
    const output = renderTaskWithEta(completedTask, 1_000);

    expect(output).not.toContain("ETA:");
  });

  test("renders longer ETA for slow tasks", () => {
    const output = renderTaskWithEta(
      makeTask({
        progressSamples: [
          { timestamp: 0, processed: 0 },
          { timestamp: 88_320_000, processed: 1 },
        ],
      }),
      88_320_000,
    );
    expect(output).toContain("ETA:");
    expect(output).toContain("24:32:00");
  });

  test("uses recent progress samples instead of lifetime average", () => {
    const output = renderTaskWithEta(
      makeTask({
        units: {
          succeeded: 11,
          failed: 0,
          processed: 11,
          total: 12,
        },
        progressSamples: [
          { timestamp: 0, processed: 0 },
          { timestamp: 10_000, processed: 1 },
          { timestamp: 40_000, processed: 11 },
        ],
      }),
      40_000,
    );

    expect(output).toContain("ETA: 00:03");
  });
});
