import { describe, expect, test } from "bun:test";
import * as Progress from "../src";

const createTask = (
  overrides: Partial<Progress.TaskSnapshot> & {
    units?: Progress.TaskSnapshot["units"];
  } = {},
): Progress.TaskSnapshot =>
  new Progress.TaskSnapshot({
    id: Progress.TaskId(1),
    parentId: null,
    description: "task",
    status: "running",
    transient: false,
    units: overrides.units ?? new Progress.DeterminateTaskUnits({ completed: 7, total: 15 }),
    config: Progress.defaultProgressBarConfig,
    startedAt: 0,
    completedAt: null,
    ...overrides,
  });

const createContext = (
  task: Progress.TaskSnapshot,
  tree: Progress.TaskTreeInfo = {
    depth: 0,
    hasChildren: false,
    hasNextSibling: false,
    ancestorHasNextSibling: [],
  },
): Progress.ProgressColumnContext => ({
  task,
  depth: tree.depth,
  tree,
  now: 2_000,
  tick: 0,
  isTTY: false,
});

describe("built-in column defaults", () => {
  test("Default() returns fresh instances", () => {
    const a = Progress.DescriptionColumn.Default();
    const b = Progress.DescriptionColumn.Default();
    expect(a === b).toBeFalse();
  });

  test("AmountColumn renders determinate units and indeterminate symbols", () => {
    const determinate = createTask();
    const runningIndeterminate = createTask({
      units: new Progress.IndeterminateTaskUnits({ spinnerFrame: 0 }),
      status: "running",
      config: {
        ...Progress.defaultProgressBarConfig,
        spinnerFrames: [".", "o", "O"],
      },
    });
    const doneIndeterminate = createTask({
      units: new Progress.IndeterminateTaskUnits({ spinnerFrame: 0 }),
      status: "done",
      completedAt: 2_000,
    });
    const failedIndeterminate = createTask({
      units: new Progress.IndeterminateTaskUnits({ spinnerFrame: 0 }),
      status: "failed",
      completedAt: 2_000,
    });

    const column = Progress.AmountColumn.Default();

    expect(column.render(createContext(determinate))).toContain("7/15");
    expect(column.render(createContext(runningIndeterminate))).toBe(".");
    expect(column.render(createContext(doneIndeterminate))).toBe("✓");
    expect(column.render(createContext(failedIndeterminate))).toBe("✗");
  });

  test("BarColumn.make customizes output characters", () => {
    const task = createTask({
      units: new Progress.DeterminateTaskUnits({ completed: 5, total: 10 }),
    });

    const column = Progress.BarColumn.make({
      fillChar: "#",
      emptyChar: "-",
      leftBracket: "[",
      rightBracket: "]",
    });

    expect(column.render(createContext(task), 8)).toBe("[###---]");
  });

  test("DescriptionColumn includes tree prefix while bar stays separate", () => {
    const description = Progress.DescriptionColumn.Default();
    const tree: Progress.TaskTreeInfo = {
      depth: 2,
      hasChildren: false,
      hasNextSibling: true,
      ancestorHasNextSibling: [true, false],
    };

    const text = description.render(createContext(createTask(), tree));

    expect(text.startsWith("   ├─ ")).toBeTrue();
    expect(text.endsWith("task")).toBeTrue();
  });

  test("EtaColumn renders only running determinate tasks", () => {
    const running = createTask({
      startedAt: 0,
      units: new Progress.DeterminateTaskUnits({ completed: 5, total: 10 }),
    });
    const done = createTask({
      status: "done",
      completedAt: 2_000,
    });

    const eta = Progress.EtaColumn.Default();

    expect(eta.render(createContext(running))).toContain("ETA:");
    expect(eta.render(createContext(done))).toBe("");
  });

  test("EtaColumn renders placeholder when running determinate eta is not yet calculable", () => {
    const runningUncalculated = createTask({
      startedAt: 0,
      units: new Progress.DeterminateTaskUnits({ completed: 0, total: 10 }),
      status: "running",
    });

    const eta = Progress.EtaColumn.Default();
    expect(eta.render(createContext(runningUncalculated))).toBe("ETA:    ");
  });

  test("Columns.defaults returns expected built-ins", () => {
    const columns = Progress.Columns.defaults();
    expect(columns.map((column) => column.id)).toEqual([
      "description",
      "bar",
      "amount",
      "elapsed",
      "eta",
    ]);
  });
});
