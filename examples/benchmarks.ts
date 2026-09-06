import assert from "node:assert/strict";
import { Effect } from "effect";
import { resolveColumns } from "../src/services/renderer/column-resolver";
import { toRenderSnapshot } from "../src/services/store/render-snapshot";
import { ProgressStore } from "../src/services/store/store";
import { TaskId, type TaskSnapshot, type ColumnDef, type TaskStore } from "../src/types";

const WARMUP_ROUNDS = 3;
const MEASURED_ROUNDS = 9;
const STORE_UPDATES = 2_000;
const COLUMN_RESOLUTIONS = 20;

interface Measurement {
  readonly name: string;
  readonly operations: number;
  readonly samplesMillis: ReadonlyArray<number>;
}

const summarize = ({ name, operations, samplesMillis }: Measurement) => {
  const sorted = samplesMillis.toSorted((a, b) => a - b);
  const medianMillis = sorted[Math.floor(sorted.length / 2)]!;
  return {
    name,
    operationsPerSample: operations,
    medianMillis,
    minMillis: sorted[0]!,
    maxMillis: sorted.at(-1)!,
    operationsPerSecond: (operations * 1_000) / medianMillis,
    samplesMillis,
  };
};

// Measure updates to one hot task while varying the size of the task Map copied by the store.
const benchmarkStore = (taskCount: number) =>
  Effect.gen(function* () {
    const store = yield* ProgressStore;
    const taskIds: TaskId[] = [];
    for (let index = 0; index < taskCount; index++) {
      taskIds.push(yield* store.addTask({ description: `task-${index}` }));
    }
    const hotTaskId = taskIds[0]!;
    const samplesMillis: number[] = [];

    for (let round = 0; round < WARMUP_ROUNDS + MEASURED_ROUNDS; round++) {
      store.flush();
      const started = performance.now();
      for (let update = 0; update < STORE_UPDATES; update++) {
        yield* store.incrementSucceeded(hotTaskId);
      }
      const elapsed = performance.now() - started;
      if (round >= WARMUP_ROUNDS) {
        samplesMillis.push(elapsed);
      }

      // Publication and correctness checks are outside the timed section.
      store.flush();
      const tasks = store.getPublishedSnapshot().tasks;
      assert.equal(tasks.size, taskCount);
      for (const [id, task] of tasks) {
        assert.equal(task.units.succeeded, id === hotTaskId ? (round + 1) * STORE_UPDATES : 0);
        assert.equal(task.units.processed, task.units.succeeded);
        assert.equal(task.units.failed, 0);
      }
    }

    return { name: `store: ${taskCount} tasks`, operations: STORE_UPDATES, samplesMillis };
  }).pipe(Effect.provide(ProgressStore.layer), Effect.scoped);

const makeColumnFixture = (rowCount: number, distinctPrepare: boolean) => {
  const store = {
    tasks: new Map<TaskId, TaskSnapshot>(),
    renderOrder: [],
    columns: new Map<TaskId, ReadonlyArray<ColumnDef<unknown, number>>>(),
  } satisfies TaskStore;
  const renderOrder: Array<TaskStore["renderOrder"][number]> = [];

  for (let index = 0; index < rowCount; index++) {
    const id = TaskId(index + 1);
    store.tasks.set(id, {
      id,
      parentId: null,
      description: `task-${index}`,
      status: "running",
      countDisplay: "detailed",
      transient: false,
      units: { succeeded: 25, failed: 0, processed: 25, total: 100 },
      startedAt: 0,
      completedAt: null,
      progressSamples: [
        { timestamp: 0, processed: 0 },
        { timestamp: 1_000, processed: 25 },
      ],
      metadata: undefined,
    } satisfies TaskSnapshot);
    renderOrder.push({ id, depth: 0 });
    if (distinctPrepare) {
      const column: ColumnDef<unknown, number> = {
        prepare: (cells) => index + cells.reduce((sum, cell) => sum + cell.task.units.processed, 0),
        render: (_cell, { prepared }) => String(prepared),
      };
      store.columns.set(id, [column]);
    }
  }

  return {
    rows: toRenderSnapshot({ ...store, renderOrder }).rows,
    columns: store.columns,
  };
};

// Compare layout and rendered output without exposing prepared data or comparing callback identities.
const columnOutput = (positions: ReturnType<typeof resolveColumns>) =>
  positions.map(({ index, flexGrow, flexShrink, flexBasis, minWidth, entries, rows }) => ({
    index,
    flexGrow,
    flexShrink,
    flexBasis,
    minWidth,
    output: entries.map((entry, index) => entry?.render(rows[index]!, {})),
  }));

const benchmarkColumns = (rowCount: number, distinctPrepare: boolean): Measurement => {
  const { rows, columns } = makeColumnFixture(rowCount, distinctPrepare);
  let result = resolveColumns(rows, columns);
  assert.equal(result.length, distinctPrepare ? 1 : 4);
  for (const position of result) {
    assert.equal(position.entries.length, rowCount);
    if (distinctPrepare) {
      position.entries.forEach((entry, index) =>
        assert.equal(entry?.render(rows[index]!, {}), String(index + 25)),
      );
    }
  }
  const expected = columnOutput(result);
  const samplesMillis: number[] = [];

  for (let round = 0; round < WARMUP_ROUNDS + MEASURED_ROUNDS; round++) {
    const started = performance.now();
    for (let iteration = 0; iteration < COLUMN_RESOLUTIONS; iteration++) {
      result = resolveColumns(rows, columns);
    }
    const elapsed = performance.now() - started;
    if (round >= WARMUP_ROUNDS) {
      samplesMillis.push(elapsed);
    }
    assert.deepEqual(columnOutput(result), expected);
  }

  return {
    name: `columns: ${rowCount} rows, ${distinctPrepare ? "distinct prepare functions" : "defaults"}`,
    operations: COLUMN_RESOLUTIONS,
    samplesMillis,
  };
};

const measurements: Measurement[] = [];
for (const taskCount of [1, 100, 1_000]) {
  measurements.push(await Effect.runPromise(benchmarkStore(taskCount)));
}
for (const rowCount of [100, 1_000]) {
  measurements.push(benchmarkColumns(rowCount, false));
  measurements.push(benchmarkColumns(rowCount, true));
}

// Print once, after all measurements, so console/terminal work cannot distort the timings.
console.log(
  JSON.stringify(
    {
      runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
      warmupRounds: WARMUP_ROUNDS,
      measuredRounds: MEASURED_ROUNDS,
      results: measurements.map(summarize),
    },
    null,
    2,
  ),
);
