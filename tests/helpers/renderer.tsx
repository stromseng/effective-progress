import { renderToString } from "ink";
import stripAnsi from "strip-ansi";
import type { TaskSnapshot } from "../../src/task-model";
import type { ProgressState } from "../../src/services/store/types";
import { TaskId } from "../../src/task-model";
import { NowProvider } from "../../src/renderer/context/now-context";
import { SpinnerProvider } from "../../src/renderer/context/spinner-context";
import { ProgressTable } from "../../src/renderer/progress-table";
import { prepareRows } from "../../src/renderer/prepare-rows";
import type { TaskRowModel } from "../../src/renderer/row-model";

export const makeTaskSnapshot = (overrides: Partial<TaskSnapshot> = {}): TaskSnapshot => ({
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
): ReadonlyArray<TaskRowModel> =>
  prepareRows({
    tasks: new Map(tasks.map((task) => [task.id, task])),
    renderOrder,
    columns: new Map(),
  }).rows;

export const makeRow = (task: TaskSnapshot): TaskRowModel => makeRows([task])[0]!;

export const renderRows = (
  rows: ReadonlyArray<TaskRowModel>,
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
      <NowProvider active={false} nowOverride={now}>
        <SpinnerProvider active={false} tickOverride={spinnerTick}>
          <ProgressTable rows={rows} columns={columns} />
        </SpinnerProvider>
      </NowProvider>,
    ),
  );
