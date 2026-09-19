import { renderToString } from "ink";
import stripAnsi from "strip-ansi";
import type { ProgressState } from "../../src/store/state";
import { TaskId, TaskSnapshot } from "../../src/tasks/model";
import { NowClockProvider } from "../../src/renderer/now-clock";
import { SpinnerClockProvider } from "../../src/renderer/spinner-clock";
import { ProgressTable } from "../../src/renderer/progress-table";
import { prepareRows } from "../../src/renderer/prepare-rows";
import type { TaskRow } from "../../src/columns/types";

type TaskSnapshotFields = ConstructorParameters<typeof TaskSnapshot>[0];

export const makeTaskSnapshot = (overrides: Partial<TaskSnapshotFields> = {}): TaskSnapshot =>
  new TaskSnapshot({
    id: TaskId(1),
    parentId: null,
    description: "task",
    status: "running",
    countDisplay: "processedOnly",
    transient: false,
    units: { succeeded: 1, failed: 0, processed: 1, total: 2 },
    startedAt: 0,
    completedAt: null,
    progressSamples: [
      { timestamp: 0, processed: 0 },
      { timestamp: 1_000, processed: 1 },
    ],
    metadata: undefined,
    ...overrides,
  });

/** Exercise the real tree and width derivation instead of recreating it in fixtures. */
export const makeRows = (
  tasks: ReadonlyArray<TaskSnapshot>,
  renderOrder: ProgressState["renderOrder"] = tasks.map(({ id }) => ({ id, depth: 0 })),
): ReadonlyArray<TaskRow> =>
  prepareRows({
    tasks: new Map(tasks.map((task) => [task.id, task])),
    renderOrder,
    columns: new Map(),
  }).rows;

export const makeRow = (task: TaskSnapshot): TaskRow => makeRows([task])[0]!;

export const renderRows = (
  rows: ReadonlyArray<TaskRow>,
  {
    columns = new Map(),
    now = 1_000,
    spinnerTick = 0,
  }: {
    readonly columns?: ProgressState["columns"];
    readonly now?: number;
    readonly spinnerTick?: number;
  } = {},
): string =>
  stripAnsi(
    renderToString(
      <NowClockProvider active={false} nowOverride={now}>
        <SpinnerClockProvider active={false} tickOverride={spinnerTick}>
          <ProgressTable rows={rows} columns={columns} />
        </SpinnerClockProvider>
      </NowClockProvider>,
    ),
  );
