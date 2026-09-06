import { expect, test } from "bun:test";
import type { CellInfo, ColumnDef } from "../src/types";
import { TaskId } from "../src/types";
import { resolveColumns } from "../src/services/renderer/column-resolver";
import { makeRows, makeTaskSnapshot } from "./helpers/renderer";

test("shared preparation runs once per position and stays bound to each renderer and sizing hint", () => {
  const calls: number[] = [];
  const prepare = (cells: ReadonlyArray<CellInfo>) => {
    calls.push(cells.length);
    return { width: cells.length * 3 };
  };
  const left: ColumnDef<unknown, { width: number }> = {
    prepare,
    minWidth: (prepared) => prepared.width,
    render: (_cell, { prepared, now }) => `left:${prepared.width}:${now}`,
  };
  const right: ColumnDef<unknown, { width: number }> = {
    prepare,
    minWidth: (prepared) => prepared.width + 1,
    render: (_cell, { prepared, spinnerTick }) => `right:${prepared.width}:${spinnerTick}`,
  };
  const rows = makeRows([makeTaskSnapshot({ id: TaskId(1) }), makeTaskSnapshot({ id: TaskId(2) })]);
  const positions = resolveColumns(
    rows,
    new Map([
      [TaskId(1), [left, left]],
      [TaskId(2), [right]],
    ]),
  );
  expect(calls).toEqual([2, 1]);
  expect(positions.map((position) => position.minWidth)).toEqual([7, 3]);
  const context = { now: 123, spinnerTick: 4 };
  expect(positions[0]!.entries[0]!.render(rows[0]!, context)).toBe("left:6:123");
  expect(positions[0]!.entries[1]!.render(rows[1]!, context)).toBe("right:6:4");
  expect(positions[1]!.entries[0]!.render(rows[0]!, context)).toBe("left:3:123");
  expect(positions[1]!.entries[1]).toBeUndefined();
  expect(calls).toEqual([2, 1]);
});
