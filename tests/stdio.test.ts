import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import * as Progress from "../src";
import { createMockStdio } from "./helpers/mock-stdio";

describe("ProgressStdio", () => {
  test("mock service can override stdout and stderr metadata independently", async () => {
    const stdio = createMockStdio({
      stdout: { isTTY: true, columns: 120, rows: 50 },
      stderr: { isTTY: false, columns: 80, rows: 20 },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provided = yield* Progress.ProgressStdio;

        provided.stdout.write("stdout-line");
        provided.stderr.write("stderr-line");

        return {
          stdoutIsTTY: provided.stdout.isTTY,
          stdoutColumns: provided.stdout.columns,
          stdoutRows: provided.stdout.rows,
          stderrIsTTY: provided.stderr.isTTY,
          stderrColumns: provided.stderr.columns,
          stderrRows: provided.stderr.rows,
        };
      }).pipe(Effect.provideService(Progress.ProgressStdio, stdio.service)),
    );

    expect(result.stdoutIsTTY).toBeTrue();
    expect(result.stdoutColumns).toBe(120);
    expect(result.stdoutRows).toBe(50);
    expect(result.stderrIsTTY).toBeFalse();
    expect(result.stderrColumns).toBe(80);
    expect(result.stderrRows).toBe(20);
    expect(stdio.stdout.getOutput()).toContain("stdout-line");
    expect(stdio.stderr.getOutput()).toContain("stderr-line");
  });

  test("default service exposes process stdout and stderr", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const stdio = yield* Progress.ProgressStdio;
        return {
          stdout: stdio.stdout,
          stderr: stdio.stderr,
        };
      }).pipe(Effect.provide(Progress.ProgressStdio.Default)),
    );

    expect(result.stdout).toBe(process.stdout);
    expect(result.stderr).toBe(process.stderr);
  });
});
