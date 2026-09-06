import { describe, expect, test } from "bun:test";
import { TaskId, type TaskSnapshot } from "../src/task-model";
import { type TaskStore } from "../src/services/store/types";
import { prepareRows } from "../src/renderer/prepare-rows";

const makeTask = (id: number, description: string): TaskSnapshot => ({
  id: TaskId(id),
  parentId: null,
  description,
  status: "running",
  countDisplay: "detailed",
  transient: false,
  units: { succeeded: 0, failed: 0, processed: 0 },
  startedAt: 0,
  completedAt: null,
  progressSamples: [{ timestamp: 0, processed: 0 }],
  metadata: undefined,
});

const makeStore = (entries: ReadonlyArray<readonly [TaskSnapshot, number]>): TaskStore => ({
  tasks: new Map(entries.map(([task]) => [task.id, task])),
  renderOrder: entries.map(([task, depth]) => ({ id: task.id, depth })),
  columns: new Map(),
});

describe("render snapshot reuse", () => {
  test("reuses unchanged rows and tree data while updating progress flags and text widths", () => {
    const root = makeTask(1, "root");
    const child = { ...makeTask(2, "下载"), parentId: root.id };
    const first = prepareRows(
      makeStore([
        [root, 0],
        [child, 1],
      ]),
    );
    const counted = { ...child, units: { succeeded: 1, failed: 0, processed: 1 } };
    const second = prepareRows(
      makeStore([
        [root, 0],
        [counted, 1],
      ]),
      first,
    );

    expect(second.rows[0]).toBe(first.rows[0]);
    expect(second.rows[1]).not.toBe(first.rows[1]);
    expect(second.rows[1]!.tree).toBe(first.rows[1]!.tree);
    expect(first.rows[1]!.derived.hasRenderableProgress).toBeFalse();
    expect(second.rows[1]!.derived).toMatchObject({
      treePrefix: "└─ ",
      descriptionWidth: 4,
      treePrefixedDescriptionWidth: 7,
      hasRenderableProgress: true,
      isDeterminate: false,
    });

    const renamed = { ...counted, description: "download", units: { ...counted.units, total: 2 } };
    const third = prepareRows(
      makeStore([
        [root, 0],
        [renamed, 1],
      ]),
      second,
    );
    expect(third.rows[1]!.derived).toMatchObject({
      descriptionWidth: 8,
      treePrefixedDescriptionWidth: 11,
      isDeterminate: true,
    });
  });

  test("updates children and ancestor connectors when the task tree grows", () => {
    const root = makeTask(1, "root");
    const child = { ...makeTask(2, "child"), parentId: root.id };
    const leaf = { ...makeTask(3, "leaf"), parentId: child.id };
    const sibling = { ...makeTask(4, "sibling"), parentId: root.id };
    const first = prepareRows(
      makeStore([
        [root, 0],
        [child, 1],
      ]),
    );
    const second = prepareRows(
      makeStore([
        [root, 0],
        [child, 1],
        [leaf, 2],
      ]),
      first,
    );

    expect(second.rows[1]!.tree.hasChildren).toBeTrue();
    expect(second.rows[1]!.tree).not.toBe(first.rows[1]!.tree);
    expect(second.rows[1]!.derived.treePrefix).toBe("└─ ");
    expect(second.rows[2]!.derived.treePrefix).toBe("   └─ ");

    const third = prepareRows(
      makeStore([
        [root, 0],
        [child, 1],
        [leaf, 2],
        [sibling, 1],
      ]),
      second,
    );
    expect(third.rows[0]).toBe(second.rows[0]);
    expect(third.rows[1]!.derived.treePrefix).toBe("├─ ");
    expect(third.rows[2]!.derived.treePrefix).toBe("│  └─ ");
    expect(third.rows[3]!.derived.treePrefix).toBe("└─ ");
  });
});
