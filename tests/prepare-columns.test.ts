import { expect, test } from "bun:test";
import type { CellInfo, ColumnDef } from "../src/columns/types";
import { TaskId } from "../src/task-model";
import { resolveColumns } from "../src/renderer/column-layout";
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
    render: (_cell, { prepared, width }) => `left:${prepared.width}:${width}`,
  };
  const right: ColumnDef<unknown, { width: number }> = {
    prepare,
    minWidth: (prepared) => prepared.width + 1,
    render: (_cell, { prepared, width }) => `right:${prepared.width}:${width}`,
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
  const context = { width: 123 };
  expect(positions[0]!.entries[0]!.render(rows[0]!, context)).toBe("left:6:123");
  expect(positions[0]!.entries[1]!.render(rows[1]!, context)).toBe("right:6:123");
  expect(positions[1]!.entries[0]!.render(rows[0]!, context)).toBe("left:3:123");
  expect(positions[1]!.entries[1]).toBeUndefined();
  expect(calls).toEqual([2, 1]);
});
