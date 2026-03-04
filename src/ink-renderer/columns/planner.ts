import type { ReactNode } from "react";

export interface ColumnPlanningContext<Row> {
  readonly rows: ReadonlyArray<Row>;
  readonly now: number;
  readonly tick: number;
  readonly terminalColumns?: number;
}

export interface ColumnVariant<Row> {
  readonly id: string;
  readonly minWidth: number;
  readonly idealWidth: number;
  readonly shrinkResistance: number;
  readonly demoteResistance: number;
  readonly hideResistance: number;
  readonly renderCell: (row: Row, width: number) => ReactNode;
}

export interface ResolvedColumn<Row> {
  readonly id: string;
  readonly grow: number;
  readonly canHide: boolean;
  readonly variants: ReadonlyArray<ColumnVariant<Row>>;
}

export interface PlannedColumn<Row> {
  readonly id: string;
  readonly variantId: string;
  readonly width: number;
  readonly renderCell: (row: Row, width: number) => ReactNode;
}

export interface ColumnPlan<Row> {
  readonly rowWidth: number;
  readonly columns: ReadonlyArray<PlannedColumn<Row>>;
}

export interface ColumnPlannerOptions<Row> {
  readonly context: ColumnPlanningContext<Row>;
  readonly baselineWidth: number;
  readonly columns: ReadonlyArray<ResolvedColumn<Row>>;
}

interface MutableColumn<Row> {
  readonly spec: ResolvedColumn<Row>;
  readonly variants: ReadonlyArray<ColumnVariant<Row>>;
  variantIndex: number;
  width: number;
  hidden: boolean;
}

const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(value)));

const activeColumns = <Row>(
  columns: ReadonlyArray<MutableColumn<Row>>,
): Array<MutableColumn<Row>> => columns.filter((column) => !column.hidden);

const visibleGapWidth = <Row>(columns: ReadonlyArray<MutableColumn<Row>>): number =>
  Math.max(0, activeColumns(columns).length - 1);

const totalWidth = <Row>(columns: ReadonlyArray<MutableColumn<Row>>): number =>
  activeColumns(columns).reduce((sum, column) => sum + column.width, 0) + visibleGapWidth(columns);

const currentVariant = <Row>(column: MutableColumn<Row>): ColumnVariant<Row> =>
  column.variants[column.variantIndex]!;

const reduceOverflowByShrink = <Row>(
  columns: ReadonlyArray<MutableColumn<Row>>,
  overflow: number,
): number => {
  let remaining = overflow;
  const candidates = activeColumns(columns)
    .filter((column) => column.width > currentVariant(column).minWidth)
    .sort((a, b) => currentVariant(a).shrinkResistance - currentVariant(b).shrinkResistance);

  for (const column of candidates) {
    if (remaining <= 0) {
      break;
    }
    const variant = currentVariant(column);
    const reducible = column.width - variant.minWidth;
    if (reducible <= 0) {
      continue;
    }
    const delta = Math.min(reducible, remaining);
    column.width -= delta;
    remaining -= delta;
  }

  return remaining;
};

const demoteOneVariant = <Row>(columns: ReadonlyArray<MutableColumn<Row>>): boolean => {
  const candidates = activeColumns(columns)
    .filter((column) => column.variantIndex + 1 < column.variants.length)
    .sort((a, b) => currentVariant(a).demoteResistance - currentVariant(b).demoteResistance);
  const selected = candidates[0];
  if (selected === undefined) {
    return false;
  }

  const nextVariant = selected.variants[selected.variantIndex + 1]!;
  selected.variantIndex += 1;
  selected.width = Math.max(nextVariant.minWidth, Math.min(selected.width, nextVariant.idealWidth));
  return true;
};

const hideOneColumn = <Row>(columns: ReadonlyArray<MutableColumn<Row>>): boolean => {
  const candidates = activeColumns(columns)
    .filter((column) => column.spec.canHide)
    .sort((a, b) => currentVariant(a).hideResistance - currentVariant(b).hideResistance);
  const selected = candidates[0];
  if (selected === undefined) {
    return false;
  }

  selected.hidden = true;
  selected.width = 0;
  return true;
};

const distributeGrowth = <Row>(columns: ReadonlyArray<MutableColumn<Row>>, extra: number) => {
  if (extra <= 0) {
    return;
  }

  const active = activeColumns(columns);
  if (active.length === 0) {
    return;
  }

  const growSum = active.reduce((sum, column) => sum + Math.max(0, column.spec.grow), 0);
  if (growSum <= 0) {
    active[0]!.width += extra;
    return;
  }

  let distributed = 0;
  for (const column of active) {
    const weight = Math.max(0, column.spec.grow);
    if (weight <= 0) {
      continue;
    }
    const share = Math.floor((extra * weight) / growSum);
    column.width += share;
    distributed += share;
  }

  let remainder = extra - distributed;
  for (const column of active) {
    if (remainder <= 0) {
      break;
    }
    if (column.spec.grow <= 0) {
      continue;
    }
    column.width += 1;
    remainder -= 1;
  }

  if (remainder > 0) {
    active[0]!.width += remainder;
  }
};

export const planColumns = <Row>({
  context,
  baselineWidth,
  columns,
}: ColumnPlannerOptions<Row>): ColumnPlan<Row> => {
  const mutable: Array<MutableColumn<Row>> = columns.flatMap((column) => {
    if (column.variants.length === 0) {
      return [];
    }
    const first = column.variants[0]!;
    return [
      {
        spec: column,
        variants: column.variants,
        variantIndex: 0,
        width: Math.max(first.minWidth, first.idealWidth),
        hidden: false,
      },
    ];
  });

  if (mutable.length === 0) {
    return {
      rowWidth: 0,
      columns: [],
    };
  }

  const naturalWidth = totalWidth(mutable);
  const clampedTerminal =
    context.terminalColumns === undefined
      ? undefined
      : clampInt(context.terminalColumns, 1, Number.POSITIVE_INFINITY);
  const baselineTarget = Math.max(1, Math.max(baselineWidth, naturalWidth));
  const target =
    clampedTerminal === undefined ? baselineTarget : Math.min(baselineTarget, clampedTerminal);

  if (naturalWidth < target) {
    distributeGrowth(mutable, target - naturalWidth);
  } else if (naturalWidth > target) {
    let overflow = naturalWidth - target;
    let progressed = true;

    while (overflow > 0 && progressed) {
      const before = overflow;
      overflow = reduceOverflowByShrink(mutable, overflow);
      if (overflow <= 0) {
        break;
      }

      if (demoteOneVariant(mutable)) {
        overflow = Math.max(0, totalWidth(mutable) - target);
        progressed = true;
        continue;
      }
      if (hideOneColumn(mutable)) {
        overflow = Math.max(0, totalWidth(mutable) - target);
        progressed = true;
        continue;
      }

      progressed = before !== overflow;
    }

    const compactedWidth = totalWidth(mutable);
    if (compactedWidth < target) {
      distributeGrowth(mutable, target - compactedWidth);
    }
  }

  const visible = activeColumns(mutable);
  return {
    rowWidth: totalWidth(mutable),
    columns: visible.map((column) => {
      const variant = currentVariant(column);
      return {
        id: column.spec.id,
        variantId: variant.id,
        width: column.width,
        renderCell: variant.renderCell,
      };
    }),
  };
};
