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
  readonly maxWidth?: number;
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

const variantMaxWidth = <Row>(column: MutableColumn<Row>): number => {
  const variant = currentVariant(column);
  return variant.maxWidth === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(variant.minWidth, variant.maxWidth);
};

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

const nextDemoteCandidate = <Row>(
  columns: ReadonlyArray<MutableColumn<Row>>,
): MutableColumn<Row> | undefined =>
  activeColumns(columns)
    .filter((column) => column.variantIndex + 1 < column.variants.length)
    .sort((a, b) => currentVariant(a).demoteResistance - currentVariant(b).demoteResistance)[0];

const applyDemote = <Row>(column: MutableColumn<Row>) => {
  const nextVariant = column.variants[column.variantIndex + 1]!;
  column.variantIndex += 1;
  const nextMaxWidth =
    nextVariant.maxWidth === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(nextVariant.minWidth, nextVariant.maxWidth);
  column.width = Math.max(
    nextVariant.minWidth,
    Math.min(column.width, nextVariant.idealWidth, nextMaxWidth),
  );
};

const nextHideCandidate = <Row>(
  columns: ReadonlyArray<MutableColumn<Row>>,
): MutableColumn<Row> | undefined =>
  activeColumns(columns)
    .filter((column) => column.spec.canHide)
    .sort((a, b) => currentVariant(a).hideResistance - currentVariant(b).hideResistance)[0];

const applyHide = <Row>(column: MutableColumn<Row>) => {
  column.hidden = true;
  column.width = 0;
};

const distributeGrowth = <Row>(columns: ReadonlyArray<MutableColumn<Row>>, extra: number) => {
  if (extra <= 0) {
    return;
  }

  let remaining = extra;
  while (remaining > 0) {
    const candidates = activeColumns(columns).filter(
      (column) => column.spec.grow > 0 && column.width < variantMaxWidth(column),
    );
    if (candidates.length === 0) {
      break;
    }

    const growSum = candidates.reduce((sum, column) => sum + Math.max(0, column.spec.grow), 0);
    if (growSum <= 0) {
      break;
    }

    let distributed = 0;
    for (const column of candidates) {
      const weight = Math.max(0, column.spec.grow);
      if (weight <= 0) {
        continue;
      }
      const headroom = Math.max(0, variantMaxWidth(column) - column.width);
      if (headroom <= 0) {
        continue;
      }
      const share = Math.min(headroom, Math.floor((remaining * weight) / growSum));
      if (share <= 0) {
        continue;
      }
      column.width += share;
      distributed += share;
    }

    if (distributed === 0) {
      for (const column of candidates) {
        if (remaining <= 0) {
          break;
        }
        const headroom = Math.max(0, variantMaxWidth(column) - column.width);
        if (headroom <= 0) {
          continue;
        }
        column.width += 1;
        distributed += 1;
        remaining -= 1;
      }
      if (distributed === 0) {
        break;
      }
      continue;
    }

    remaining -= distributed;
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
        width: Math.max(
          first.minWidth,
          Math.min(
            first.idealWidth,
            first.maxWidth === undefined
              ? Number.POSITIVE_INFINITY
              : Math.max(first.minWidth, first.maxWidth),
          ),
        ),
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

      const demoteCandidate = nextDemoteCandidate(mutable);
      const hideCandidate = nextHideCandidate(mutable);
      if (demoteCandidate === undefined && hideCandidate === undefined) {
        progressed = before !== overflow;
        continue;
      }

      const demoteScore =
        demoteCandidate === undefined
          ? Number.POSITIVE_INFINITY
          : currentVariant(demoteCandidate).demoteResistance;
      const hideScore =
        hideCandidate === undefined
          ? Number.POSITIVE_INFINITY
          : currentVariant(hideCandidate).hideResistance;

      if (demoteScore <= hideScore && demoteCandidate !== undefined) {
        applyDemote(demoteCandidate);
      } else if (hideCandidate !== undefined) {
        applyHide(hideCandidate);
      }

      overflow = Math.max(0, totalWidth(mutable) - target);
      progressed = true;
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
