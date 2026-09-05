import { expectTypeOf, test } from "bun:test";
import { Context, Effect, Result } from "effect";
import * as Progress from "../src";

class Dependency extends Context.Service<Dependency, { readonly value: number }>()(
  "test/Dependency",
) {}

test("task overloads preserve values, errors, metadata and unrelated requirements", () => {
  const work = Effect.gen(function* () {
    yield* Progress.Progress;
    yield* Progress.Task;
    return (yield* Dependency).value;
  });
  expectTypeOf(Progress.task(work, { description: "public" })).toEqualTypeOf<
    Effect.Effect<number, never, Dependency>
  >();
  expectTypeOf(
    Progress.task(
      (handle) => {
        expectTypeOf(handle.getMetadata).toEqualTypeOf<Effect.Effect<{ score: number }>>();
        return Effect.fail("failure" as const);
      },
      { description: "metadata", metadata: { score: 0 } },
    ),
  ).toEqualTypeOf<Effect.Effect<never, "failure", never>>();

  const serviceWork = Effect.gen(function* () {
    const progress = yield* Progress.Progress;
    return yield* progress.task(work, { description: "service" });
  });
  expectTypeOf(serviceWork).toEqualTypeOf<
    Effect.Effect<number, never, Progress.Progress | Dependency>
  >();
});

test("all delegates tuple and record result inference to Effect", () => {
  expectTypeOf(
    Progress.all([Effect.succeed(1), Effect.succeed("two")], { description: "tuple" }),
  ).toEqualTypeOf<Effect.Effect<[number, string]>>();
  expectTypeOf(
    Progress.all(
      { value: Effect.fail("failure" as const) },
      {
        description: "record",
        mode: "result",
      },
    ),
  ).toEqualTypeOf<Effect.Effect<{ value: Result.Result<never, "failure"> }>>();
  expectTypeOf(
    Progress.all([Effect.succeed(1)], { description: "discard", discard: true }),
  ).toEqualTypeOf<Effect.Effect<void>>();
});
