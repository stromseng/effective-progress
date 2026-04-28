import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import * as Progress from "../src";

describe("types and schemas", () => {
  test("TaskSnapshot validates with progress samples", () => {
    const snapshot = Schema.decodeUnknownSync(Progress.TaskSnapshotSchema)({
      id: Progress.TaskId(1),
      parentId: null,
      description: "task",
      status: "running",
      countDisplay: "detailed",
      transient: false,
      units: {
        succeeded: 1,
        failed: 0,
        processed: 1,
        total: 2,
      },
      startedAt: 0,
      completedAt: null,
      progressSamples: [
        { timestamp: 0, processed: 0 },
        { timestamp: 1_000, processed: 1 },
      ],
      metadata: undefined,
    });

    expect(snapshot.description).toBe("task");
  });

  test("ProgressTaskEvent schema still decodes task lifecycle events", () => {
    const decode = Schema.decodeUnknownSync(Progress.ProgressTaskEventSchema);
    const updatedEvent = decode({
      _tag: "TaskUpdated",
      taskId: 1,
      description: "updated",
      succeeded: 2,
      failed: 1,
      processed: 3,
      total: 5,
      transient: true,
      countDisplay: "processedOnly",
    });

    expect(updatedEvent._tag).toBe("TaskUpdated");
    const taskUpdatedEvent = updatedEvent as Progress.TaskUpdatedEvent;
    expect(taskUpdatedEvent.description).toBe("updated");

    const advancedEvent = decode({
      _tag: "TaskAdvanced",
      taskId: 1,
      amount: 1,
      kind: "failed",
    });

    expect(advancedEvent._tag).toBe("TaskAdvanced");
  });
});
