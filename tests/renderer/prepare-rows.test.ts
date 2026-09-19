import { describe, expect, test } from "bun:test";
import { TaskId, type TaskSnapshot } from "../../src/tasks/model";
import { type ProgressState } from "../../src/store/state";
import { prepareRows } from "../../src/renderer/prepare-rows";
import { makeTaskSnapshot } from "../helpers/renderer";

const makeStore = (entries: ReadonlyArray<readonly [TaskSnapshot, number]>): ProgressState => ({
  tasks: new Map(entries.map(([task]) => [task.id, task])),
  renderOrder: entries.map(([task, depth]) => ({ id: task.id, depth })),
  columns: new Map(),
});

describe("render view reuse", () => {
  test("reuses unchanged rows and tree data while updating text widths", () => {
    const root = makeTaskSnapshot({ id: TaskId(1), description: "root" });
    const child = makeTaskSnapshot({ id: TaskId(2), description: "下载", parentId: root.id });
    const first = prepareRows(
      makeStore([
        [root, 0],
        [child, 1],
      ]),
    );
    const counted = makeTaskSnapshot({
      ...child,
      units: { succeeded: 1, failed: 0, processed: 1 },
    });
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
    expect(second.rows[1]!.derived).toEqual({
      treePrefix: "└─ ",
      treePrefixWidth: 3,
      descriptionWidth: 4,
    });

    const renamed = makeTaskSnapshot({
      ...counted,
      description: "download",
      units: { ...counted.units, total: 2 },
    });
    const third = prepareRows(
      makeStore([
        [root, 0],
        [renamed, 1],
      ]),
      second,
    );
    expect(third.rows[1]!.derived.descriptionWidth).toBe(8);
  });

  test("updates children and ancestor connectors when the task tree grows", () => {
    const root = makeTaskSnapshot({ id: TaskId(1), description: "root" });
    const child = makeTaskSnapshot({ id: TaskId(2), description: "child", parentId: root.id });
    const leaf = makeTaskSnapshot({ id: TaskId(3), description: "leaf", parentId: child.id });
    const sibling = makeTaskSnapshot({ id: TaskId(4), description: "sibling", parentId: root.id });
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

    expect(second.rows[1]!.tree).toBe(first.rows[1]!.tree);
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
