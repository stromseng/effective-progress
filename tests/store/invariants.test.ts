import { expect, test } from "bun:test";
import { Effect, Option } from "effect";
import { TaskId } from "../../src/task-model";
import { makeProgressStore } from "../../src/services/store/store";

test.each([NaN, Infinity, -Infinity])("ignores non-finite counter input %s", async (value) => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* makeProgressStore;
      const id = yield* store.addTask({ description: "finite counters", total: 10 });
      yield* store.updateTask(id, { succeeded: 2, failed: 1 });
      const before = Option.getOrThrow(yield* store.getTask(id));

      yield* store.incrementSucceeded(id, value);
      yield* store.incrementFailed(id, value);
      yield* store.updateTask(id, { succeeded: value, failed: value });
      const unchanged = Option.getOrThrow(yield* store.getTask(id));
      expect(unchanged.units).toEqual(before.units);
      expect(unchanged.progressSamples).toBe(before.progressSamples);

      yield* store.updateTask(id, { succeeded: value, failed: 3, description: "valid fields" });
      const updated = Option.getOrThrow(yield* store.getTask(id));
      expect(updated.units).toEqual({ succeeded: 2, failed: 3, processed: 5, total: 10 });
      expect(updated.description).toBe("valid fields");
    }).pipe(Effect.scoped),
  );
});

test("rejects arithmetic overflow in individual counters and their sum", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* makeProgressStore;
      const id = yield* store.addTask({ description: "large counters" });
      yield* store.updateTask(id, { succeeded: Number.MAX_VALUE });
      const before = Option.getOrThrow(yield* store.getTask(id));
      expect(before.units.processed).toBe(Number.MAX_VALUE);

      yield* store.incrementSucceeded(id, Number.MAX_VALUE);
      expect(Option.getOrThrow(yield* store.getTask(id)).units).toEqual(before.units);
      yield* store.incrementFailed(id, Number.MAX_VALUE);
      expect(Option.getOrThrow(yield* store.getTask(id)).units).toEqual(before.units);
      yield* store.updateTask(id, { succeeded: Number.MAX_VALUE, failed: Number.MAX_VALUE });
      const after = Option.getOrThrow(yield* store.getTask(id));
      expect(after.units).toEqual(before.units);
      expect(after.progressSamples).toBe(before.progressSamples);
    }).pipe(Effect.scoped),
  );
});

test("clamps finite negative counters while preserving finite overflow beyond total", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* makeProgressStore;
      const id = yield* store.addTask({ description: "finite counts", total: 2 });
      yield* store.updateTask(id, { succeeded: -3, failed: 5 });
      expect(Option.getOrThrow(yield* store.getTask(id)).units).toEqual({
        succeeded: 0,
        failed: 5,
        processed: 5,
        total: 2,
      });
      yield* store.incrementFailed(id, -10);
      expect(Option.getOrThrow(yield* store.getTask(id)).units.processed).toBe(0);
    }).pipe(Effect.scoped),
  );
});

test.each(["missing", "removed"] as const)("normalizes a %s parent to a root", async (kind) => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* makeProgressStore;
      // The missing ID is also the next allocated ID, so it must not become a self-parent.
      let parentId = TaskId(1);
      if (kind === "removed") {
        parentId = yield* store.addTask({
          description: "removed parent",
          transient: true,
          countDisplay: "processedOnly",
        });
        yield* store.completeTask(parentId);
      }
      const id = yield* store.addTask({ description: "root", parentId });
      const task = Option.getOrThrow(yield* store.getTask(id));
      expect(task.parentId).toBeNull();
      expect(task.transient).toBeFalse();
      expect(task.countDisplay).toBe("detailed");
      store.flush();
      expect(store.getPublishedSnapshot().renderOrder).toEqual([{ id, depth: 0 }]);
    }).pipe(Effect.scoped),
  );
});
