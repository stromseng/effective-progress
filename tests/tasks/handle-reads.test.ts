import { expect, test } from "bun:test";
import { Effect, Option } from "effect";
import * as Progress from "../../src";
import { Renderer } from "../../src/renderer/renderer";

const withProgress = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(Progress.Progress.layer),
    Effect.provideService(Renderer, { start: Effect.void }),
    Effect.scoped,
  );

test.each([undefined, null, 0])("preserves present metadata %s in Some", async (metadata) => {
  const result = await Effect.runPromise(
    withProgress(
      Progress.task(
        (handle) =>
          Effect.gen(function* () {
            return { metadata: yield* handle.getMetadata, snapshot: yield* handle.getSnapshot };
          }),
        { description: "present", metadata },
      ),
    ),
  );
  expect(result.metadata).toEqual(Option.some(metadata));
  expect(Option.isSome(result.snapshot)).toBeTrue();
});

test.each(["complete", "fail"] as const)("returns None after transient %s", async (finalize) => {
  const result = await Effect.runPromise(
    withProgress(
      Progress.task(
        (handle) =>
          Effect.gen(function* () {
            yield* handle.setMetadata(2);
            expect(yield* handle.getMetadata).toEqual(Option.some(2));
            yield* handle[finalize];
            yield* handle.setMetadata(3);
            let updaterCalled = false;
            yield* handle.updateMetadata((value) => {
              updaterCalled = true;
              return value + 1;
            });
            return {
              metadata: yield* handle.getMetadata,
              snapshot: yield* handle.getSnapshot,
              updaterCalled,
            };
          }),
        { description: "transient", metadata: 1, transient: true },
      ),
    ),
  );
  expect(result).toEqual({
    metadata: Option.none(),
    snapshot: Option.none(),
    updaterCalled: false,
  });
});

test("child reads return None after a transient parent removes the subtree", async () => {
  const result = await Effect.runPromise(
    withProgress(
      Progress.task(
        (parent) =>
          Progress.task(
            (child) =>
              Effect.gen(function* () {
                yield* parent.complete;
                return { metadata: yield* child.getMetadata, snapshot: yield* child.getSnapshot };
              }),
            { description: "child", metadata: "child metadata" },
          ),
        { description: "parent", transient: true },
      ),
    ),
  );
  expect(result).toEqual({ metadata: Option.none(), snapshot: Option.none() });
});

test("retained tasks remain readable after completion", async () => {
  const result = await Effect.runPromise(
    withProgress(
      Progress.task(
        (handle) =>
          Effect.gen(function* () {
            yield* handle.complete;
            return { metadata: yield* handle.getMetadata, snapshot: yield* handle.getSnapshot };
          }),
        { description: "retained", metadata: 42 },
      ),
    ),
  );
  expect(result.metadata).toEqual(Option.some(42));
  expect(Option.getOrThrow(result.snapshot).status).toBe("done");
});

test.each(["complete", "fail"] as const)("freezes all task fields after %s", async (finalize) => {
  await Effect.runPromise(
    withProgress(
      Progress.task(
        (handle) =>
          Effect.gen(function* () {
            yield* handle.incrementSucceeded(2);
            yield* handle.incrementFailed(1);
            yield* handle[finalize];
            const before = Option.getOrThrow(yield* handle.getSnapshot);
            let updaterCalled = false;

            yield* handle.update({
              description: "changed",
              total: 50,
              succeeded: 20,
              failed: 10,
              countDisplay: "processedOnly",
            });
            yield* handle.incrementSucceeded();
            yield* handle.incrementFailed();
            yield* handle.setMetadata(99);
            yield* handle.updateMetadata((value) => {
              updaterCalled = true;
              return value + 1;
            });
            yield* handle.complete;
            yield* handle.fail;

            expect(Option.getOrThrow(yield* handle.getSnapshot)).toBe(before);
            expect(yield* handle.getMetadata).toEqual(Option.some(42));
            expect(updaterCalled).toBeFalse();
            expect(before.status).toBe(finalize === "complete" ? "done" : "failed");
          }),
        { description: "finalized", metadata: 42, total: 5 },
      ),
    ),
  );
});
