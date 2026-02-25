import chalk from "chalk";
import { Clock, Context, Effect, Layer, Ref } from "effect";
import { fitRenderedText, visibleWidth } from "./renderer/ansi";
import { computeTreeInfo, renderTreePrefix } from "./renderer/tree";
import { Track } from "./renderer/types";
import type {
  CellWrapMode,
  ColumnTrack,
  ProgressColumn,
  ProgressColumnContext,
  ProgressColumnVariant,
} from "./renderer/types";
import type { ProgressTerminalService } from "./terminal";
import type { ProgressBarConfigShape, RendererConfigShape, TaskSnapshot, TaskStore } from "./types";
export { Track };
export type {
  CellWrapMode,
  ColumnTrack,
  ProgressColumn,
  ProgressColumnContext,
  ProgressColumnVariant,
  TaskTreeInfo,
} from "./renderer/types";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";
const MOVE_UP_ONE = "\x1b[1A";
const RESERVED_SECONDS_WIDTH = 3; // width of "59s"
const PREVIEW_RENDER_WIDTH = 10_000;
const TREE_PREFIX_COLLAPSE_BAR_WIDTH = 10;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const textWidth = (text: string): number => Array.from(text).length;

const formatDurationSeconds = (seconds: number): string => {
  const value = Math.max(0, Math.floor(seconds));
  if (value < 60) {
    return `${value}s`;
  }
  if (value < 3600) {
    const mins = Math.floor(value / 60);
    const secs = value % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  const hours = Math.floor(value / 3600);
  const mins = Math.floor((value % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const formatDeterminateUnits = (completed: number, total: number): string => {
  const totalText = `${total}`;
  const completedText = `${completed}`.padStart(totalText.length, " ");
  return `${completedText}/${totalText}`;
};

const formatElapsed = (snapshot: TaskSnapshot, now: number): string => {
  const elapsedMillis = Math.max(0, (snapshot.completedAt ?? now) - snapshot.startedAt);
  return formatDurationSeconds(elapsedMillis / 1000);
};

const formatEta = (snapshot: TaskSnapshot, now: number): string => {
  if (snapshot.status !== "running" || snapshot.units._tag !== "DeterminateTaskUnits") {
    return "";
  }

  const { completed, total } = snapshot.units;
  const remaining = total - completed;
  if (completed <= 0 || remaining <= 0) {
    return "";
  }

  const elapsedMillis = Math.max(1, now - snapshot.startedAt);
  const etaMillis = Math.max(0, Math.floor((elapsedMillis / completed) * remaining));
  return `ETA: ${formatDurationSeconds(etaMillis / 1000)}`;
};

const reserveTimeWidth = (formattedDuration: string): string =>
  formattedDuration.padStart(RESERVED_SECONDS_WIDTH, " ");

const styleIfTTY = (isTTY: boolean, style: (text: string) => string, text: string): string =>
  isTTY ? style(text) : text;

interface ColumnBaseOptions {
  readonly id?: string;
  readonly track?: ColumnTrack;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly collapsePriority?: number;
  readonly wrapMode?: CellWrapMode;
}

const normalizeNumber = (value: number | undefined, fallback: number): number =>
  value === undefined ? fallback : Math.max(0, Math.floor(value));

export interface DescriptionColumnOptions extends ColumnBaseOptions {}

export class DescriptionColumn implements ProgressColumn {
  readonly id: string;
  readonly track: ColumnTrack;
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly collapsePriority: number;
  readonly wrapMode: CellWrapMode;

  constructor(options: DescriptionColumnOptions = {}) {
    this.id = options.id ?? "description";
    this.track = options.track ?? Track.fr(1);
    this.minWidth = normalizeNumber(options.minWidth, 8);
    this.maxWidth = options.maxWidth;
    this.collapsePriority = normalizeNumber(options.collapsePriority, 100);
    this.wrapMode = options.wrapMode ?? "ellipsis";
  }

  static Default(): DescriptionColumn {
    return new DescriptionColumn();
  }

  static make(options: DescriptionColumnOptions = {}): DescriptionColumn {
    return new DescriptionColumn(options);
  }

  render(context: ProgressColumnContext): string {
    const prefix = renderTreePrefix(context.tree);
    return `${prefix}${context.task.description}`;
  }

  variants(context: ProgressColumnContext): ReadonlyArray<ProgressColumnVariant> {
    const full: ProgressColumnVariant = {
      render: () => `${renderTreePrefix(context.tree)}${context.task.description}`,
    };

    if (context.tree.depth <= 0) {
      return [full];
    }

    return [
      full,
      {
        render: () => context.task.description,
      },
    ];
  }
}

export interface BarColumnOptions extends ColumnBaseOptions {
  readonly barWidth?: number;
  readonly fillChar?: string;
  readonly emptyChar?: string;
  readonly leftBracket?: string;
  readonly rightBracket?: string;
}

const resolveBarConfig = (
  snapshot: TaskSnapshot,
  options: BarColumnOptions,
): ProgressBarConfigShape => ({
  spinnerFrames: snapshot.config.spinnerFrames,
  barWidth: options.barWidth ?? snapshot.config.barWidth,
  fillChar: options.fillChar ?? snapshot.config.fillChar,
  emptyChar: options.emptyChar ?? snapshot.config.emptyChar,
  leftBracket: options.leftBracket ?? snapshot.config.leftBracket,
  rightBracket: options.rightBracket ?? snapshot.config.rightBracket,
});

export class BarColumn implements ProgressColumn {
  readonly id: string;
  readonly track: ColumnTrack;
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly collapsePriority: number;
  readonly wrapMode: CellWrapMode;
  readonly options: BarColumnOptions;

  constructor(options: BarColumnOptions = {}) {
    this.id = options.id ?? "bar";
    this.track = options.track ?? Track.auto();
    this.minWidth = normalizeNumber(options.minWidth, 1);
    this.maxWidth = options.maxWidth;
    this.collapsePriority = normalizeNumber(options.collapsePriority, 10);
    this.wrapMode = options.wrapMode ?? "truncate";
    this.options = options;
  }

  static Default(): BarColumn {
    return new BarColumn();
  }

  static make(options: BarColumnOptions = {}): BarColumn {
    return new BarColumn(options);
  }

  measure(context: ProgressColumnContext): number {
    if (context.task.units._tag !== "DeterminateTaskUnits") {
      return 0;
    }

    const config = resolveBarConfig(context.task, this.options);
    const bracketWidth = textWidth(config.leftBracket) + textWidth(config.rightBracket);
    return Math.max(this.minWidth, bracketWidth + Math.max(1, config.barWidth));
  }

  render(context: ProgressColumnContext, width: number): string {
    if (context.task.units._tag !== "DeterminateTaskUnits") {
      return "";
    }

    const config = resolveBarConfig(context.task, this.options);
    const bracketWidth = textWidth(config.leftBracket) + textWidth(config.rightBracket);
    const totalWidth = Math.max(1, Math.floor(width));
    const innerWidth = Math.max(1, totalWidth - bracketWidth);
    const safeTotal = Math.max(1, context.task.units.total);
    const ratio =
      context.task.status === "done" ? 1 : clamp(context.task.units.completed / safeTotal, 0, 1);
    const filled = Math.round(ratio * innerWidth);

    const fill = config.fillChar.repeat(filled);
    const empty = config.emptyChar.repeat(Math.max(0, innerWidth - filled));

    const fillStyle =
      context.task.status === "failed"
        ? chalk.red
        : context.task.status === "done"
          ? chalk.green
          : chalk.blue;
    const emptyStyle = context.task.status === "failed" ? chalk.red : chalk.white.dim;

    return [
      styleIfTTY(context.isTTY, chalk.white.dim, config.leftBracket),
      styleIfTTY(context.isTTY, fillStyle, fill),
      styleIfTTY(context.isTTY, emptyStyle, empty),
      styleIfTTY(context.isTTY, chalk.white.dim, config.rightBracket),
    ].join("");
  }

  variants(context: ProgressColumnContext): ReadonlyArray<ProgressColumnVariant> {
    if (context.task.units._tag !== "DeterminateTaskUnits") {
      return [];
    }

    const config = resolveBarConfig(context.task, this.options);
    const bracketWidth = textWidth(config.leftBracket) + textWidth(config.rightBracket);
    const fullWidth = Math.max(this.minWidth, bracketWidth + Math.max(1, config.barWidth));
    const compactInnerWidths = [20, TREE_PREFIX_COLLAPSE_BAR_WIDTH]
      .map((innerWidth) => Math.max(1, Math.floor(innerWidth)))
      .filter((innerWidth) => innerWidth < Math.max(1, config.barWidth));
    const compactWidths = compactInnerWidths.map((innerWidth) =>
      Math.max(this.minWidth, bracketWidth + innerWidth),
    );
    const uniqueWidths = [...new Set([fullWidth, ...compactWidths])];

    return uniqueWidths.map((variantWidth) => ({
      measure: () => variantWidth,
      render: (variantContext, width) => this.render(variantContext, width),
    }));
  }
}

export interface AmountColumnOptions extends ColumnBaseOptions {
  readonly doneSymbol?: string;
  readonly failedSymbol?: string;
}

export class AmountColumn implements ProgressColumn {
  readonly id: string;
  readonly track: ColumnTrack;
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly collapsePriority: number;
  readonly wrapMode: CellWrapMode;
  readonly doneSymbol: string;
  readonly failedSymbol: string;

  constructor(options: AmountColumnOptions = {}) {
    this.id = options.id ?? "amount";
    this.track = options.track ?? Track.auto();
    this.minWidth = normalizeNumber(options.minWidth, 1);
    this.maxWidth = options.maxWidth;
    this.collapsePriority = normalizeNumber(options.collapsePriority, 30);
    this.wrapMode = options.wrapMode ?? "truncate";
    this.doneSymbol = options.doneSymbol ?? "✓";
    this.failedSymbol = options.failedSymbol ?? "✗";
  }

  static Default(): AmountColumn {
    return new AmountColumn();
  }

  static make(options: AmountColumnOptions = {}): AmountColumn {
    return new AmountColumn(options);
  }

  render(context: ProgressColumnContext): string {
    const { task } = context;

    if (task.units._tag === "DeterminateTaskUnits") {
      return styleIfTTY(
        context.isTTY,
        task.status === "failed" ? chalk.red : chalk.whiteBright,
        formatDeterminateUnits(task.units.completed, task.units.total),
      );
    }

    if (task.status === "running") {
      const frames = task.config.spinnerFrames;
      const frameIndex = (task.units.spinnerFrame + context.tick) % frames.length;
      const frame = frames[frameIndex] ?? frames[0] ?? "";
      return styleIfTTY(context.isTTY, chalk.yellow, frame);
    }

    if (task.status === "done") {
      return styleIfTTY(context.isTTY, chalk.green, this.doneSymbol);
    }

    return styleIfTTY(context.isTTY, chalk.red, this.failedSymbol);
  }
}

export interface ElapsedColumnOptions extends ColumnBaseOptions {
  readonly padSeconds?: boolean;
}

export class ElapsedColumn implements ProgressColumn {
  readonly id: string;
  readonly track: ColumnTrack;
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly collapsePriority: number;
  readonly wrapMode: CellWrapMode;
  readonly padSeconds: boolean;

  constructor(options: ElapsedColumnOptions = {}) {
    this.id = options.id ?? "elapsed";
    this.track = options.track ?? Track.auto();
    this.minWidth = normalizeNumber(options.minWidth, 1);
    this.maxWidth = options.maxWidth;
    this.collapsePriority = normalizeNumber(options.collapsePriority, 40);
    this.wrapMode = options.wrapMode ?? "truncate";
    this.padSeconds = options.padSeconds ?? true;
  }

  static Default(): ElapsedColumn {
    return new ElapsedColumn();
  }

  static make(options: ElapsedColumnOptions = {}): ElapsedColumn {
    return new ElapsedColumn(options);
  }

  render(context: ProgressColumnContext): string {
    const raw = formatElapsed(context.task, context.now);
    const elapsed = this.padSeconds ? reserveTimeWidth(raw) : raw;
    return styleIfTTY(context.isTTY, chalk.gray, elapsed);
  }
}

export interface EtaColumnOptions extends ColumnBaseOptions {
  readonly label?: string;
  readonly pendingText?: string;
}

export class EtaColumn implements ProgressColumn {
  readonly id: string;
  readonly track: ColumnTrack;
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly collapsePriority: number;
  readonly wrapMode: CellWrapMode;
  readonly label: string;
  readonly pendingText: string;

  constructor(options: EtaColumnOptions = {}) {
    this.id = options.id ?? "eta";
    this.track = options.track ?? Track.auto();
    this.minWidth = normalizeNumber(options.minWidth, 0);
    this.maxWidth = options.maxWidth;
    this.collapsePriority = normalizeNumber(options.collapsePriority, 20);
    this.wrapMode = options.wrapMode ?? "truncate";
    this.label = options.label ?? "ETA";
    this.pendingText = options.pendingText ?? `${this.label}:    `;
  }

  static Default(): EtaColumn {
    return new EtaColumn();
  }

  static make(options: EtaColumnOptions = {}): EtaColumn {
    return new EtaColumn(options);
  }

  private resolveEtaText(context: ProgressColumnContext, includeLabel: boolean): string {
    const value = formatEta(context.task, context.now);
    if (value.length === 0) {
      if (context.task.status === "running" && context.task.units._tag === "DeterminateTaskUnits") {
        if (includeLabel) {
          return this.pendingText;
        }
        const pendingPrefix = `${this.label}: `;
        return this.pendingText.startsWith(pendingPrefix)
          ? this.pendingText.slice(pendingPrefix.length)
          : this.pendingText.replace(/^ETA:\s*/, "");
      }
      return "";
    }

    if (includeLabel) {
      if (this.label === "ETA") {
        return value;
      }
      return value.replace(/^ETA/, this.label);
    }

    const labeled = this.label === "ETA" ? value : value.replace(/^ETA/, this.label);
    const prefix = `${this.label}: `;
    return labeled.startsWith(prefix)
      ? labeled.slice(prefix.length)
      : labeled.replace(/^ETA:\s*/, "");
  }

  render(context: ProgressColumnContext): string {
    return styleIfTTY(context.isTTY, chalk.gray, this.resolveEtaText(context, true));
  }

  variants(context: ProgressColumnContext): ReadonlyArray<ProgressColumnVariant> {
    const full = this.resolveEtaText(context, true);
    if (full.length === 0) {
      return [
        {
          render: () => "",
        },
      ];
    }

    const compact = this.resolveEtaText(context, false);
    if (compact === full) {
      return [
        {
          render: () => styleIfTTY(context.isTTY, chalk.gray, full),
        },
      ];
    }

    return [
      {
        render: () => styleIfTTY(context.isTTY, chalk.gray, full),
      },
      {
        render: () => styleIfTTY(context.isTTY, chalk.gray, compact),
      },
    ];
  }
}

export interface LiteralColumnOptions extends ColumnBaseOptions {
  readonly text: string;
}

export class LiteralColumn implements ProgressColumn {
  readonly id: string;
  readonly track: ColumnTrack;
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly collapsePriority: number;
  readonly wrapMode: CellWrapMode;
  readonly text: string;

  constructor(options: LiteralColumnOptions) {
    this.id = options.id ?? `literal:${options.text}`;
    this.track = options.track ?? Track.auto();
    this.minWidth = normalizeNumber(options.minWidth, 0);
    this.maxWidth = options.maxWidth;
    this.collapsePriority = normalizeNumber(options.collapsePriority, 0);
    this.wrapMode = options.wrapMode ?? "truncate";
    this.text = options.text;
  }

  static Default(text = "•"): LiteralColumn {
    return new LiteralColumn({ text });
  }

  static make(text: string, options: Omit<LiteralColumnOptions, "text"> = {}): LiteralColumn {
    return new LiteralColumn({ ...options, text });
  }

  render(): string {
    return this.text;
  }
}

export const Columns = {
  defaults: (): ReadonlyArray<ProgressColumn> => [
    DescriptionColumn.Default(),
    BarColumn.Default(),
    AmountColumn.Default(),
    ElapsedColumn.Default(),
    EtaColumn.Default(),
  ],
} as const;

const resolveTrack = (column: ProgressColumn): ColumnTrack => column.track ?? Track.auto();

const resolveColumnBounds = (column: ProgressColumn): { min: number; max?: number } => {
  const min = Math.max(0, Math.floor(column.minWidth ?? 0));
  const max =
    column.maxWidth === undefined ? undefined : Math.max(min, Math.floor(column.maxWidth));
  return { min, max };
};

const ratioDistribute = (
  total: number,
  ratios: ReadonlyArray<number>,
  minimums: ReadonlyArray<number>,
): ReadonlyArray<number> => {
  const amounts = [...minimums];
  const totalMinimum = amounts.reduce((sum, value) => sum + value, 0);
  const distributable = Math.max(0, total - totalMinimum);

  let remaining = distributable;
  let totalRatio = ratios.reduce((sum, ratio) => sum + ratio, 0);

  for (let i = 0; i < ratios.length; i++) {
    if (remaining <= 0) {
      break;
    }

    const ratio = ratios[i] ?? 0;
    const share = totalRatio > 0 ? Math.ceil((ratio * remaining) / totalRatio) : 0;
    amounts[i] = (amounts[i] ?? 0) + share;
    remaining -= share;
    totalRatio -= ratio;
  }

  return amounts;
};

const resolveTotalWidth = (
  terminalColumns: number | undefined,
  width: number | "fullwidth",
): number | undefined => {
  if (width === "fullwidth") {
    if (terminalColumns === undefined) {
      return undefined;
    }

    return Math.max(1, Math.floor(terminalColumns));
  }

  const resolvedConfiguredWidth = Math.max(1, Math.floor(width));

  if (terminalColumns === undefined) {
    return resolvedConfiguredWidth;
  }

  return Math.min(Math.max(1, Math.floor(terminalColumns)), resolvedConfiguredWidth);
};

const shrinkByPriority = (
  widths: Array<number>,
  minWidths: ReadonlyArray<number>,
  columns: ReadonlyArray<ProgressColumn>,
  overflow: number,
): number => {
  const shrinkable = columns
    .map((column, index) => ({
      index,
      priority: column.collapsePriority ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.priority - b.priority);

  let remainingOverflow = overflow;

  for (const entry of shrinkable) {
    if (remainingOverflow <= 0) {
      break;
    }

    const current = widths[entry.index] ?? 0;
    const min = minWidths[entry.index] ?? 0;
    const available = Math.max(0, current - min);
    if (available <= 0) {
      continue;
    }

    const reduceBy = Math.min(available, remainingOverflow);
    widths[entry.index] = current - reduceBy;
    remainingOverflow -= reduceBy;
  }

  return remainingOverflow;
};

const shrinkProportionally = (
  widths: Array<number>,
  minWidths: ReadonlyArray<number>,
  overflow: number,
): number => {
  let remainingOverflow = overflow;

  while (remainingOverflow > 0) {
    const entries = widths
      .map((width, index) => ({
        index,
        width,
        min: minWidths[index] ?? 0,
        available: Math.max(0, width - (minWidths[index] ?? 0)),
      }))
      .filter((entry) => entry.available > 0);

    if (entries.length === 0) {
      break;
    }

    const distribution = ratioDistribute(
      remainingOverflow,
      entries.map((entry) => Math.max(1, entry.width)),
      entries.map(() => 0),
    );

    let reduced = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const target = distribution[i] ?? 0;
      if (target <= 0) {
        continue;
      }

      const reduceBy = Math.min(entry.available, target);
      if (reduceBy <= 0) {
        continue;
      }

      widths[entry.index] = (widths[entry.index] ?? 0) - reduceBy;
      remainingOverflow -= reduceBy;
      reduced += reduceBy;
    }

    if (reduced <= 0) {
      break;
    }
  }

  return remainingOverflow;
};

const resolveColumnWidths = (
  columns: ReadonlyArray<ProgressColumn>,
  intrinsicWidths: ReadonlyArray<number>,
  totalWidth: number | undefined,
  gap: number,
): {
  readonly widths: ReadonlyArray<number>;
  readonly overflowBeforeShrink: number;
} => {
  if (columns.length === 0) {
    return {
      widths: [],
      overflowBeforeShrink: 0,
    };
  }

  const minWidths = columns.map((column) => resolveColumnBounds(column).min);
  const maxWidths = columns.map((column) => resolveColumnBounds(column).max);
  const widths: Array<number> = Array.from({ length: columns.length }, () => 0);

  for (let i = 0; i < columns.length; i++) {
    const column = columns[i]!;
    const track = resolveTrack(column);
    const minWidth = minWidths[i] ?? 0;
    const maxWidth = maxWidths[i];
    const intrinsic = Math.max(0, Math.floor(intrinsicWidths[i] ?? 0));

    const baseWidth = (() => {
      switch (track._tag) {
        case "Fixed":
          return Math.max(minWidth, track.width);
        case "Fraction":
          return totalWidth === undefined ? Math.max(minWidth, intrinsic) : minWidth;
        case "Auto":
          return Math.max(minWidth, intrinsic);
      }
    })();

    widths[i] =
      maxWidth === undefined ? baseWidth : clamp(baseWidth, minWidth, Math.max(minWidth, maxWidth));
  }

  if (totalWidth === undefined) {
    return {
      widths,
      overflowBeforeShrink: 0,
    };
  }

  const usableWidth = Math.max(1, totalWidth - gap * Math.max(0, columns.length - 1));

  const fractionColumns: Array<{ index: number; weight: number }> = [];
  for (let index = 0; index < columns.length; index++) {
    const track = resolveTrack(columns[index]!);
    if (track._tag === "Fraction") {
      fractionColumns.push({ index, weight: track.weight });
    }
  }

  let remaining = usableWidth - widths.reduce((sum, width) => sum + width, 0);
  const overflowBeforeShrink = Math.max(0, -remaining);

  if (remaining > 0 && fractionColumns.length > 0) {
    const distributed = ratioDistribute(
      remaining,
      fractionColumns.map((entry) => entry.weight),
      fractionColumns.map(() => 0),
    );

    for (let i = 0; i < fractionColumns.length; i++) {
      const entry = fractionColumns[i]!;
      widths[entry.index] = (widths[entry.index] ?? 0) + (distributed[i] ?? 0);
    }

    remaining = usableWidth - widths.reduce((sum, width) => sum + width, 0);
  }

  if (remaining < 0) {
    let overflow = -remaining;
    overflow = shrinkByPriority(widths, minWidths, columns, overflow);
    if (overflow > 0) {
      overflow = shrinkProportionally(widths, minWidths, overflow);
    }
  }

  return {
    widths: widths.map((width, index) => {
      const min = minWidths[index] ?? 0;
      const max = maxWidths[index];

      if (max === undefined) {
        return Math.max(min, width);
      }

      return clamp(Math.max(min, width), min, max);
    }),
    overflowBeforeShrink,
  };
};

const normalizeColumns = (
  columns: ReadonlyArray<ProgressColumn | string>,
): ReadonlyArray<ProgressColumn> => {
  const resolved = columns.length > 0 ? columns : Columns.defaults();

  return resolved.map((entry, index) => {
    const normalized = typeof entry === "string" ? LiteralColumn.make(entry) : entry;

    if (
      typeof normalized !== "object" ||
      normalized === null ||
      typeof normalized.render !== "function"
    ) {
      throw new Error(`Invalid progress column at index ${index}`);
    }

    if (typeof normalized.id !== "string" || normalized.id.length === 0) {
      throw new Error(`Progress column at index ${index} is missing a valid id`);
    }

    return normalized;
  });
};

interface OrderedTaskModel {
  readonly snapshot: TaskSnapshot;
  readonly depth: number;
}

interface RenderedFrame {
  readonly lines: ReadonlyArray<string>;
  readonly lineByTaskId: ReadonlyMap<number, string>;
}

const fallbackVariantForColumn = (column: ProgressColumn): ProgressColumnVariant => ({
  measure: column.measure === undefined ? undefined : (context) => column.measure?.(context) ?? 0,
  render: (context, width) => column.render(context, width),
});

const resolveVariantForLevel = (
  column: ProgressColumn,
  context: ProgressColumnContext,
  level: number,
): ProgressColumnVariant => {
  const variants = column.variants?.(context);
  if (variants === undefined || variants.length === 0) {
    return fallbackVariantForColumn(column);
  }

  return variants[Math.min(level, variants.length - 1)]!;
};

const isDescriptionColumn = (column: ProgressColumn): boolean =>
  column instanceof DescriptionColumn || column.id === "description";

const isEtaColumn = (column: ProgressColumn): boolean =>
  column instanceof EtaColumn || column.id === "eta";

const isBarColumn = (column: ProgressColumn): boolean =>
  column instanceof BarColumn || column.id === "bar";

const renderTaskFrame = (
  orderedTasks: ReadonlyArray<OrderedTaskModel>,
  columns: ReadonlyArray<ProgressColumn>,
  rendererConfig: RendererConfigShape,
  now: number,
  tick: number,
  terminalColumns: number | undefined,
  isTTY: boolean,
): RenderedFrame => {
  if (orderedTasks.length === 0) {
    return {
      lines: [],
      lineByTaskId: new Map(),
    };
  }

  const orderedWithTree = computeTreeInfo(
    orderedTasks.map((entry) => ({ snapshot: entry.snapshot, depth: entry.depth })),
  );

  const contexts = orderedWithTree.map<ProgressColumnContext>((entry, index) => ({
    task: orderedTasks[index]!.snapshot,
    depth: orderedTasks[index]!.depth,
    tree: entry.tree,
    now,
    tick,
    isTTY,
  }));

  const gap = Math.max(0, Math.floor(rendererConfig.columnGap ?? 1));
  const totalWidth = resolveTotalWidth(terminalColumns, rendererConfig.width);
  const maxVariantLevelByColumn = columns.map((column) => {
    let maxLevel = 0;
    for (const context of contexts) {
      const variants = column.variants?.(context);
      if (variants !== undefined && variants.length > 0) {
        maxLevel = Math.max(maxLevel, variants.length - 1);
      }
    }
    return maxLevel;
  });
  const variantLevelByColumn = columns.map(() => 0);

  const resolveLayoutForVariants = (levels: ReadonlyArray<number>) => {
    const intrinsicByColumn: Array<number> = Array.from({ length: columns.length }, () => 0);
    const hasContentByColumn: Array<boolean> = Array.from({ length: columns.length }, () => false);

    for (let col = 0; col < columns.length; col++) {
      const column = columns[col]!;
      const level = levels[col] ?? 0;

      for (const context of contexts) {
        const variant = resolveVariantForLevel(column, context, level);
        const preview = `${variant.render(context, PREVIEW_RENDER_WIDTH)}`;
        const previewWidth = visibleWidth(preview);
        if (previewWidth > 0) {
          hasContentByColumn[col] = true;
        }

        if (typeof variant.measure === "function") {
          const measured = Number(variant.measure(context));
          if (Number.isFinite(measured)) {
            intrinsicByColumn[col] = Math.max(
              intrinsicByColumn[col] ?? 0,
              Math.max(0, Math.floor(measured)),
            );
          }
        } else {
          intrinsicByColumn[col] = Math.max(intrinsicByColumn[col] ?? 0, previewWidth);
        }
      }
    }

    const activeColumnIndexes = columns
      .map((_column, index) => index)
      .filter((index) => hasContentByColumn[index] ?? false);
    const activeColumns = activeColumnIndexes.map((index) => columns[index]!);
    const intrinsicWidths = activeColumnIndexes.map((index) => intrinsicByColumn[index] ?? 0);
    const widthResolution = resolveColumnWidths(activeColumns, intrinsicWidths, totalWidth, gap);

    return {
      intrinsicByColumn,
      activeColumnIndexes,
      activeColumns,
      widths: widthResolution.widths,
      overflowBeforeShrink: widthResolution.overflowBeforeShrink,
    };
  };

  let layout = resolveLayoutForVariants(variantLevelByColumn);

  if (totalWidth !== undefined) {
    while (true) {
      const hasCompressedColumns = layout.activeColumnIndexes.some((columnIndex, activeIndex) => {
        const assignedWidth = layout.widths[activeIndex] ?? 0;
        const intrinsicWidth = layout.intrinsicByColumn[columnIndex] ?? 0;
        return assignedWidth < intrinsicWidth;
      });

      if (layout.overflowBeforeShrink <= 0 && !hasCompressedColumns) {
        break;
      }

      const hasPendingEtaCompaction = columns.some(
        (column, index) =>
          isEtaColumn(column) &&
          (variantLevelByColumn[index] ?? 0) < (maxVariantLevelByColumn[index] ?? 0),
      );
      const activeBarWidths = layout.activeColumnIndexes.flatMap((columnIndex, activeIndex) =>
        isBarColumn(columns[columnIndex]!) ? [layout.widths[activeIndex] ?? 0] : [],
      );
      const barsAreTightEnoughForTreeCollapse = activeBarWidths.every(
        (width) => width <= TREE_PREFIX_COLLAPSE_BAR_WIDTH,
      );

      const candidates = columns
        .map((_column, index) => index)
        .filter(
          (index) => (variantLevelByColumn[index] ?? 0) < (maxVariantLevelByColumn[index] ?? 0),
        )
        .map((index) => {
          const column = columns[index]!;
          if (
            isDescriptionColumn(column) &&
            (hasPendingEtaCompaction || !barsAreTightEnoughForTreeCollapse)
          ) {
            return undefined;
          }

          const currentIntrinsic = layout.intrinsicByColumn[index] ?? 0;
          const trialLevels = [...variantLevelByColumn];
          trialLevels[index] = (trialLevels[index] ?? 0) + 1;
          const nextLayout = resolveLayoutForVariants(trialLevels);
          const nextIntrinsic = nextLayout.intrinsicByColumn[index] ?? 0;
          return {
            index,
            reduction: Math.max(0, currentIntrinsic - nextIntrinsic),
            priority: column.collapsePriority ?? Number.MAX_SAFE_INTEGER,
          };
        })
        .filter(
          (candidate): candidate is { index: number; reduction: number; priority: number } =>
            candidate !== undefined,
        )
        .sort((a, b) => b.reduction - a.reduction || a.priority - b.priority || a.index - b.index);

      const best = candidates[0];
      if (best === undefined) {
        break;
      }

      variantLevelByColumn[best.index] = (variantLevelByColumn[best.index] ?? 0) + 1;
      layout = resolveLayoutForVariants(variantLevelByColumn);
    }
  }

  if (layout.activeColumnIndexes.length === 0) {
    const emptyLines = orderedTasks.map(() => "");
    return {
      lines: emptyLines,
      lineByTaskId: new Map(orderedTasks.map((entry) => [entry.snapshot.id as number, ""])),
    };
  }

  const gapText = " ".repeat(gap);
  const lines = contexts.map((context) =>
    layout.activeColumns
      .map((column, index) => {
        const originalColumnIndex = layout.activeColumnIndexes[index]!;
        const width = layout.widths[index] ?? 0;
        const variant = resolveVariantForLevel(
          column,
          context,
          variantLevelByColumn[originalColumnIndex] ?? 0,
        );
        const raw = `${variant.render(context, width)}`;
        const wrapMode = columns[originalColumnIndex]!.wrapMode ?? "truncate";
        return fitRenderedText(raw, width, wrapMode, isTTY);
      })
      .join(gapText)
      .trimEnd(),
  );

  const lineByTaskId = new Map<number, string>();
  for (let i = 0; i < orderedTasks.length; i++) {
    lineByTaskId.set(orderedTasks[i]!.snapshot.id as number, lines[i] ?? "");
  }

  return {
    lines,
    lineByTaskId,
  };
};

export interface FrameRendererService {
  readonly run: (
    storeRef: Ref.Ref<TaskStore>,
    logsRef: Ref.Ref<ReadonlyArray<string>>,
    pendingLogsRef: Ref.Ref<ReadonlyArray<string>>,
    dirtyRef: Ref.Ref<boolean>,
    terminal: ProgressTerminalService,
    isTTY: boolean,
    rendererConfig: RendererConfigShape,
    maxRetainedLogLines: number,
  ) => Effect.Effect<void>;
}

const makeDefaultFrameRenderer = (): FrameRendererService => ({
  run: (
    storeRef,
    logsRef,
    pendingLogsRef,
    dirtyRef,
    terminal,
    isTTY,
    rendererConfig,
    maxRetainedLogLines,
  ) =>
    Effect.gen(function* () {
      const retainLogHistory = maxRetainedLogLines > 0;
      const compiledColumns = normalizeColumns(rendererConfig.columns);
      let previousLineCount = 0;
      let nonTTYTaskSignatureById = new Map<number, string>();
      let tick = 0;
      let rendererActive = false;
      let sessionActive = false;

      const clipTTYFrameLines = (lines: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const terminalRows = yield* terminal.stderrRows;
          if (terminalRows === undefined) {
            return lines;
          }

          const visibleLineLimit = Math.max(1, terminalRows - 1);
          if (lines.length <= visibleLineLimit) {
            return lines;
          }

          if (visibleLineLimit === 1) {
            return [`... ${lines.length} lines hidden`];
          }

          const hiddenLineCount = lines.length - visibleLineLimit + 1;
          return [
            `... ${hiddenLineCount} lines hidden (showing latest lines)`,
            ...lines.slice(lines.length - (visibleLineLimit - 1)),
          ];
        });

      const startTTYSession = Effect.gen(function* () {
        if (!isTTY || sessionActive) {
          return;
        }

        yield* terminal.writeStderr(HIDE_CURSOR);
        sessionActive = true;
      });

      const stopTTYSession = Effect.gen(function* () {
        if (!isTTY || !sessionActive) {
          return;
        }

        yield* terminal.writeStderr(`\n${SHOW_CURSOR}`);
        previousLineCount = 0;
        sessionActive = false;
      });

      const renderNonTTYTaskUpdates = (
        ordered: ReadonlyArray<{
          snapshot: TaskSnapshot;
          line: string;
        }>,
      ) => {
        const nextTaskSignatureById = new Map<number, string>();
        const changedTaskLines: Array<string> = [];
        const nonTtyUpdateStep = Math.max(1, Math.floor(rendererConfig.nonTtyUpdateStep));

        for (let i = 0; i < ordered.length; i++) {
          const taskId = ordered[i]!.snapshot.id as number;
          const snapshot = ordered[i]!.snapshot;
          const signature =
            snapshot.units._tag === "DeterminateTaskUnits"
              ? `${snapshot.status}:${snapshot.description}:${Math.floor(snapshot.units.completed / nonTtyUpdateStep)}:${snapshot.units.total}`
              : `${snapshot.status}:${snapshot.description}`;

          nextTaskSignatureById.set(taskId, signature);
          if (nonTTYTaskSignatureById.get(taskId) !== signature) {
            const line = ordered[i]!.line;
            if (line.length > 0) {
              changedTaskLines.push(line);
            }
          }
        }

        return Effect.gen(function* () {
          if (changedTaskLines.length > 0) {
            yield* terminal.writeStderr(`${changedTaskLines.join("\n")}\n`);
          }

          nonTTYTaskSignatureById = nextTaskSignatureById;
        });
      };

      const renderFrame = (mode: "tick" | "final") =>
        Effect.gen(function* () {
          const drainedLogs = yield* Ref.getAndSet(pendingLogsRef, []);
          const store = yield* Ref.get(storeRef);
          const orderedTasks = store.renderOrder.flatMap((row) => {
            const snapshot = store.tasks.get(row.id);
            if (!snapshot || (snapshot.transient && snapshot.status !== "running")) {
              return [];
            }

            return [
              {
                snapshot,
                depth: row.depth,
              },
            ];
          });

          const now = yield* Clock.currentTimeMillis;
          const frameTick = mode === "final" ? tick + 1 : tick;
          const terminalColumns = isTTY ? yield* terminal.stderrColumns : undefined;

          const renderedFrame = renderTaskFrame(
            orderedTasks,
            compiledColumns,
            rendererConfig,
            now,
            isTTY ? frameTick : 0,
            terminalColumns,
            isTTY,
          );

          if (isTTY) {
            let frame = "";

            if (previousLineCount > 0) {
              frame += `\r${CLEAR_LINE}`;
              for (let i = 1; i < previousLineCount; i++) {
                frame += MOVE_UP_ONE + CLEAR_LINE;
              }
            }

            if (retainLogHistory) {
              const historyLogs = yield* Ref.get(logsRef);
              const lines = yield* clipTTYFrameLines([...historyLogs, ...renderedFrame.lines]);
              if (lines.length > 0) {
                frame += lines.join("\n");
              }
              previousLineCount = lines.length;
            } else {
              if (drainedLogs.length > 0) {
                frame += `${drainedLogs.join("\n")}\n`;
              }
              if (renderedFrame.lines.length > 0) {
                frame += renderedFrame.lines.join("\n");
              }
              previousLineCount = renderedFrame.lines.length;
            }

            if (frame) {
              yield* terminal.writeStderr(frame);
            }
            return;
          }

          if (drainedLogs.length > 0) {
            yield* terminal.writeStderr(`${drainedLogs.join("\n")}\n`);
          }

          const orderedForNonTTY = orderedTasks.map((task) => ({
            snapshot: task.snapshot,
            line: renderedFrame.lineByTaskId.get(task.snapshot.id as number) ?? "",
          }));
          yield* renderNonTTYTaskUpdates(orderedForNonTTY);
        });

      const renderLoop = Effect.gen(function* () {
        rendererActive = true;
        if (isTTY) {
          yield* startTTYSession;
        }

        while (true) {
          const dirty = yield* Ref.getAndSet(dirtyRef, false);
          const tasks = Array.from((yield* Ref.get(storeRef)).tasks.values()).filter(
            (task) => !(task.transient && task.status !== "running"),
          );
          const hasActiveSpinners = tasks.some(
            (task) => task.status === "running" && task.units._tag === "IndeterminateTaskUnits",
          );
          const hasPendingLogs = (yield* Ref.get(pendingLogsRef)).length > 0;

          if (isTTY) {
            if (dirty || hasActiveSpinners || hasPendingLogs) {
              yield* renderFrame("tick");
            }
          } else if (dirty || hasActiveSpinners) {
            yield* renderFrame("tick");
          }

          tick += 1;
          yield* Effect.sleep(Math.max(1, Math.floor(rendererConfig.renderIntervalMillis)));
        }
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            if (!rendererActive) {
              return;
            }

            if (isTTY) {
              if (sessionActive) {
                yield* renderFrame("final");
                yield* stopTTYSession;
              }
              return;
            }

            yield* renderFrame("final");
          }),
        ),
      );

      if (isTTY && rendererConfig.disableUserInput) {
        return yield* terminal.withRawInputCapture(renderLoop);
      }

      return yield* renderLoop;
    }),
});

export class FrameRenderer extends Context.Tag("stromseng.dev/effective-progress/FrameRenderer")<
  FrameRenderer,
  FrameRendererService
>() {
  static readonly Default = Layer.succeed(
    FrameRenderer,
    FrameRenderer.of(makeDefaultFrameRenderer()),
  );
}
