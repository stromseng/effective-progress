import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import * as Progress from "../src";

describe("types and schemas", () => {
  test("TaskSnapshot validates without renderer/progressbar fields", () => {
    const snapshot = new Progress.TaskSnapshot({
      id: Progress.TaskId(1),
      parentId: null,
      description: "task",
      status: "running",
      transient: false,
      units: new Progress.DeterminateTaskUnits({ completed: 1, total: 2 }),
      startedAt: 0,
      completedAt: null,
    });

    expect(snapshot.description).toBe("task");
  });

  test("ProgressTaskEvent schema still decodes task lifecycle events", () => {
    const decode = Schema.decodeUnknownSync(Progress.ProgressTaskEventSchema);
    const event = decode({
      _tag: "TaskUpdated",
      taskId: 1,
      description: "updated",
      completed: 2,
      total: 5,
      transient: true,
    });

    expect(event._tag).toBe("TaskUpdated");
    if (event._tag !== "TaskUpdated") {
      throw new Error("unexpected event tag");
    }
    expect(event.description).toBe("updated");
  });
});
