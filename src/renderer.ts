import { Clock, Context, Duration, Effect, Layer, Ref } from "effect";
import { Theme, type ThemeRole, type ThemeService } from "./theme";
import type { ProgressTerminalService } from "./terminal";
import type { RendererConfigShape, TaskSnapshot, TaskStore } from "./types";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";
const MOVE_UP_ONE = "\x1b[1A";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

// Use code-point length instead of UTF-16 code-unit length so surrogate pairs
// (for example emoji) count as a single visible character.
const textWidth = (text: string): number => Array.from(text).length;

const segmentWidth = (segments: ReadonlyArray<Segment>): number =>
  segments.reduce((width, segment) => width + textWidth(segment.text), 0);

const formatElapsed = (snapshot: TaskSnapshot, now: number): string => {
  const elapsedMillis = Math.max(0, (snapshot.completedAt ?? now) - snapshot.startedAt);
  const duration =
    snapshot.status === "running"
      ? Duration.seconds(Math.floor(elapsedMillis / 1000))
      : Duration.millis(elapsedMillis);
  return `${Duration.format(duration)}`;
};

const formatEta = (snapshot: TaskSnapshot, now: number): string => {
  if (snapshot.status !== "running") {
    return "ETA: --";
  }

  if (snapshot.units._tag !== "DeterminateTaskUnits") {
    return "ETA: --";
  }

  const { completed, total } = snapshot.units;
  const remaining = total - completed;
  if (completed <= 0 || remaining <= 0) {
    return "ETA: --";
  }

  const elapsedMillis = Math.max(1, now - snapshot.startedAt);
  const etaMillis = Math.max(0, Math.floor((elapsedMillis / completed) * remaining));
  const duration = Duration.seconds(Math.floor(etaMillis / 1000));
  return `ETA: ${Duration.format(duration)}`;
};

/** Defines how a cell claims width during the shrink/fit stage. */
export type ColumnTrack =
  | {
      readonly _tag: "Auto";
    }
  | {
      readonly _tag: "Fixed";
      readonly width: number;
    }
  | {
      readonly _tag: "Fraction";
      readonly weight: number;
    };

export const Track = {
  auto: (): ColumnTrack => ({ _tag: "Auto" }),
  fixed: (width: number): ColumnTrack => ({
    _tag: "Fixed",
    width: Math.max(0, Math.floor(width)),
  }),
  fr: (weight = 1): ColumnTrack => ({
    _tag: "Fraction",
    weight: Math.max(0.001, weight),
  }),
} as const;

/** Tree relationship metadata for rendering connectors on each row. */
export interface TaskTreeInfo {
  readonly depth: number;
  readonly hasNextSibling: boolean;
  readonly hasChildren: boolean;
  readonly ancestorHasNextSibling: ReadonlyArray<boolean>;
}

/** Task snapshot plus render-time context captured before the build stage. */
export interface OrderedTaskModel {
  readonly snapshot: TaskSnapshot;
  readonly depth: number;
  readonly theme: ThemeService;
}

/** Unstyled text token emitted by build and consumed by color stage. */
export interface Segment {
  readonly text: string;
  readonly role: ThemeRole;
}

/** How a cell behaves when width is smaller than its intrinsic content. */
export type CellWrapMode = "truncate" | "no-wrap-ellipsis";

/** Logical, uncolored cell description produced by the build stage. */
export interface CellModel {
  readonly id: string;
  readonly track?: ColumnTrack;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly wrapMode?: CellWrapMode;
  readonly collapsePriority?: number;
  readonly intrinsicWidth?: number;
  readonly segments: ReadonlyArray<Segment>;
  readonly renderAtWidth?: (width: number) => ReadonlyArray<Segment>;
}

/** A logical line composed of cells prior to width fitting and coloring. */
export interface LogicalRow {
  readonly cells: ReadonlyArray<CellModel>;
  readonly gap?: number;
  readonly lineVariant?: "lead" | "continuation";
}

/** All rows produced for one task entry (single-line or multi-line). */
export interface TaskBlockModel {
  readonly taskId: number;
  readonly depth: number;
  readonly theme: ThemeService;
  readonly rows: ReadonlyArray<LogicalRow>;
}

/** Full uncolored frame model for all currently rendered tasks. */
export interface FrameModel {
  readonly taskBlocks: ReadonlyArray<TaskBlockModel>;
}

/** Cell after shrink/fit with concrete width and fitted segments. */
export interface FittedCell {
  readonly id: string;
  readonly width: number;
  readonly segments: ReadonlyArray<Segment>;
}

/** Row after shrink/fit with concrete per-cell widths. */
export interface FittedRow {
  readonly depth: number;
  readonly theme: ThemeService;
  readonly gap: number;
  readonly cells: ReadonlyArray<FittedCell>;
}

/** Fitted rows for a single task block. */
export interface FittedTaskBlock {
  readonly taskId: number;
  readonly rows: ReadonlyArray<FittedRow>;
}

/** Full frame after fit but before ANSI styling. */
export interface FittedFrameModel {
  readonly taskBlocks: ReadonlyArray<FittedTaskBlock>;
}

/** Inputs required by the default build stage implementation. */
export interface BuildStageBuildOptions {
  readonly orderedTasks: ReadonlyArray<OrderedTaskModel>;
  readonly rendererConfig: RendererConfigShape;
  readonly now: number;
  readonly tick: number;
}

/** Public extension point: convert task snapshots to a logical frame model. */
export interface BuildStageService {
  readonly buildFrame: (options: BuildStageBuildOptions) => FrameModel;
}

/** Width constraints applied by the shrink stage. */
export interface ShrinkWidthConstraints {
  readonly terminalColumns: number | undefined;
  readonly maxTaskWidth: number | undefined;
}

/** Inputs for shrink/fit stage execution. */
export interface ShrinkStageFitOptions {
  readonly frame: FrameModel;
  readonly width: ShrinkWidthConstraints;
}

/** Public extension point: resolve concrete widths and truncate content. */
export interface ShrinkStageService {
  readonly fitFrame: (options: ShrinkStageFitOptions) => FittedFrameModel;
}

/** Inputs for the color/materialization stage. */
export interface ColorStageColorOptions {
  readonly frame: FittedFrameModel;
}

/** Public extension point: style a fitted frame into terminal lines. */
export interface ColorStageService {
  readonly colorFrame: (options: ColorStageColorOptions) => ReadonlyArray<string>;
}

/** Inputs for the top-level frame renderer loop. */
export interface FrameRendererRunOptions {
  readonly storeRef: Ref.Ref<TaskStore>;
  readonly logsRef: Ref.Ref<ReadonlyArray<string>>;
  readonly pendingLogsRef: Ref.Ref<ReadonlyArray<string>>;
  readonly dirtyRef: Ref.Ref<boolean>;
  readonly terminal: ProgressTerminalService;
  readonly isTTY: boolean;
  readonly rendererConfig: RendererConfigShape;
  readonly maxRetainedLogLines: number;
}

/** Service that owns the render loop and writes frames to the terminal. */
export interface FrameRendererService {
  readonly run: (options: FrameRendererRunOptions) => Effect.Effect<void>;
}

const createSegment = (text: string, role: ThemeRole): Segment => ({ text, role });

const getCellIntrinsicWidth = (cell: CellModel): number => {
  if (cell.intrinsicWidth !== undefined) {
    return Math.max(0, Math.floor(cell.intrinsicWidth));
  }

  return segmentWidth(cell.segments);
};

const getCellBounds = (cell: CellModel): { min: number; max?: number } => {
  const min = Math.max(0, Math.floor(cell.minWidth ?? 0));
  const max = cell.maxWidth === undefined ? undefined : Math.max(min, Math.floor(cell.maxWidth));
  return { min, max };
};

const resolveTrack = (cell: CellModel): ColumnTrack => cell.track ?? Track.auto();

// Deterministic integer ratio distribution. We ceil each step and subtract
// from the remaining pool so the final sum always matches the target exactly.
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

const resolveTotalWidth = (width: ShrinkWidthConstraints): number | undefined => {
  const maxTaskWidth =
    width.maxTaskWidth === undefined ? undefined : Math.max(1, Math.floor(width.maxTaskWidth));

  if (width.terminalColumns === undefined) {
    return maxTaskWidth;
  }

  const terminalColumns = Math.max(1, Math.floor(width.terminalColumns));
  if (maxTaskWidth === undefined) {
    return terminalColumns;
  }

  return Math.min(terminalColumns, maxTaskWidth);
};

const shrinkByPriority = (
  widths: Array<number>,
  minWidths: ReadonlyArray<number>,
  cells: ReadonlyArray<CellModel>,
  overflow: number,
): number => {
  // First collapse pass: only columns marked as wrapable/truncatable,
  // processed by explicit collapse priority.
  const shrinkable = cells
    .map((cell, index) => ({
      index,
      priority: cell.collapsePriority ?? Number.MAX_SAFE_INTEGER,
      wrapMode: cell.wrapMode ?? "truncate",
    }))
    .filter((entry) => entry.wrapMode === "truncate")
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
  // Last-resort collapse pass: if priority-based shrinking is not enough,
  // reduce all remaining shrinkable columns proportionally.
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

const resolveRowWidths = (
  row: LogicalRow,
  totalWidth: number | undefined,
): ReadonlyArray<number> => {
  // 1) Resolve base widths from tracks + intrinsic size.
  // 2) Distribute extra room to fraction columns.
  // 3) If overflowing: priority-based collapse, then proportional fallback.
  const gap = Math.max(0, Math.floor(row.gap ?? 1));
  const cells = row.cells;

  if (cells.length === 0) {
    return [];
  }

  const minWidths = cells.map((cell) => getCellBounds(cell).min);
  const maxWidths = cells.map((cell) => getCellBounds(cell).max);
  const widths: Array<number> = Array.from({ length: cells.length }, () => 0);

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    const track = resolveTrack(cell);
    const minWidth = minWidths[i] ?? 0;
    const maxWidth = maxWidths[i];
    const intrinsic = getCellIntrinsicWidth(cell);

    const baseWidth = (() => {
      switch (track._tag) {
        case "Fixed":
          return Math.max(minWidth, track.width);
        case "Fraction":
          return minWidth;
        case "Auto":
          return Math.max(minWidth, intrinsic);
      }
    })();

    widths[i] =
      maxWidth === undefined ? baseWidth : clamp(baseWidth, minWidth, Math.max(minWidth, maxWidth));
  }

  if (totalWidth === undefined) {
    return widths;
  }

  const usableWidth = Math.max(1, totalWidth - gap * Math.max(0, cells.length - 1));

  const fractionColumns: Array<{ index: number; weight: number }> = [];
  for (let index = 0; index < cells.length; index++) {
    const track = resolveTrack(cells[index]!);
    if (track._tag === "Fraction") {
      fractionColumns.push({ index, weight: track.weight });
    }
  }

  let remaining = usableWidth - widths.reduce((sum, width) => sum + width, 0);

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
    overflow = shrinkByPriority(widths, minWidths, cells, overflow);
    if (overflow > 0) {
      overflow = shrinkProportionally(widths, minWidths, overflow);
    }
  }

  return widths.map((width, index) => {
    const min = minWidths[index] ?? 0;
    const max = maxWidths[index];

    if (max === undefined) {
      return Math.max(min, width);
    }

    return clamp(Math.max(min, width), min, max);
  });
};

interface CharacterToken {
  readonly char: string;
  readonly role: ThemeRole;
}

const toCharacterTokens = (segments: ReadonlyArray<Segment>): Array<CharacterToken> => {
  const tokens: Array<CharacterToken> = [];

  for (const segment of segments) {
    for (const char of Array.from(segment.text)) {
      tokens.push({ char, role: segment.role });
    }
  }

  return tokens;
};

const fromCharacterTokens = (tokens: ReadonlyArray<CharacterToken>): ReadonlyArray<Segment> => {
  if (tokens.length === 0) {
    return [];
  }

  const segments: Array<Segment> = [];
  let currentRole = tokens[0]!.role;
  let buffer = "";

  for (const token of tokens) {
    if (token.role !== currentRole) {
      segments.push(createSegment(buffer, currentRole));
      buffer = token.char;
      currentRole = token.role;
      continue;
    }

    buffer += token.char;
  }

  if (buffer.length > 0) {
    segments.push(createSegment(buffer, currentRole));
  }

  return segments;
};

const fitSegments = (
  segments: ReadonlyArray<Segment>,
  width: number,
  wrapMode: CellWrapMode,
): ReadonlyArray<Segment> => {
  // Segment fitting is role-preserving: truncate by character tokens,
  // optionally append ellipsis, then pad with plain-space tokens.
  const target = Math.max(0, Math.floor(width));
  if (target <= 0) {
    return [];
  }

  const chars = toCharacterTokens(segments);

  const truncatedChars = (() => {
    if (chars.length <= target) {
      return chars;
    }

    if (wrapMode === "no-wrap-ellipsis") {
      if (target === 1) {
        return [{ char: "…", role: chars[0]?.role ?? "plain" }];
      }

      const keep = chars.slice(0, Math.max(0, target - 1));
      const ellipsisRole = keep[keep.length - 1]?.role ?? chars[0]?.role ?? "plain";
      return [...keep, { char: "…", role: ellipsisRole }];
    }

    return chars.slice(0, target);
  })();

  const truncatedSegments = fromCharacterTokens(truncatedChars);
  const visibleWidth = segmentWidth(truncatedSegments);

  if (visibleWidth >= target) {
    return truncatedSegments;
  }

  return [...truncatedSegments, createSegment(" ".repeat(target - visibleWidth), "plain")];
};

const treeAncestorPrefix = (tree: TaskTreeInfo): string =>
  tree.ancestorHasNextSibling.map((hasNext) => (hasNext ? "│  " : "   ")).join("");

const renderTreePrefix = (tree: TaskTreeInfo, variant: "lead" | "continuation"): string => {
  if (tree.depth <= 0) {
    return "";
  }

  const ancestor = treeAncestorPrefix(tree);

  if (variant === "lead") {
    return `${ancestor}${tree.hasNextSibling ? "├─ " : "└─ "}`;
  }

  const trunk = `${ancestor}${tree.hasNextSibling ? "│  " : "   "}`;
  if (tree.hasChildren) {
    return `${trunk}│  `;
  }

  return trunk;
};

const computeTreeInfo = (ordered: ReadonlyArray<{ snapshot: TaskSnapshot; depth: number }>) => {
  // Precompute sibling/ancestor relationships so connector rendering is
  // deterministic and independent from column layout decisions.
  const hasNextSiblingByIndex: Array<boolean> = Array.from({ length: ordered.length }, () => false);

  for (let i = 0; i < ordered.length; i++) {
    const depth = ordered[i]!.depth;
    for (let j = i + 1; j < ordered.length; j++) {
      const candidateDepth = ordered[j]!.depth;
      if (candidateDepth < depth) {
        break;
      }
      if (candidateDepth === depth) {
        hasNextSiblingByIndex[i] = true;
        break;
      }
    }
  }

  const ancestorStateByDepth: Array<boolean> = [];

  return ordered.map((entry, index) => {
    const depth = entry.depth;
    ancestorStateByDepth.length = depth;

    const hasChildren =
      index + 1 < ordered.length &&
      ordered[index + 1] !== undefined &&
      ordered[index + 1]!.depth > depth;

    const tree: TaskTreeInfo = {
      depth,
      hasNextSibling: hasNextSiblingByIndex[index] ?? false,
      hasChildren,
      ancestorHasNextSibling: [...ancestorStateByDepth],
    };

    ancestorStateByDepth[depth] = hasNextSiblingByIndex[index] ?? false;

    return {
      ...entry,
      tree,
    };
  });
};

const treeCell = (tree: TaskTreeInfo, variant: "lead" | "continuation"): CellModel => ({
  id: "tree",
  track: Track.auto(),
  wrapMode: "truncate",
  collapsePriority: 100,
  minWidth: 0,
  segments: [createSegment(renderTreePrefix(tree, variant), "treeConnector")],
});

const textCell = (text: string): CellModel => ({
  id: "text",
  track: Track.auto(),
  wrapMode: "no-wrap-ellipsis",
  collapsePriority: 50,
  minWidth: 4,
  segments: [createSegment(text, "text")],
});

const spinnerCell = (snapshot: TaskSnapshot, tick: number): CellModel => {
  const frames = snapshot.config.spinnerFrames;
  const frameIndex =
    snapshot.units._tag === "IndeterminateTaskUnits"
      ? (snapshot.units.spinnerFrame + tick) % frames.length
      : 0;
  const frame = frames[frameIndex] ?? frames[0] ?? "";

  return {
    id: "spinner",
    track: Track.auto(),
    wrapMode: "truncate",
    collapsePriority: 70,
    minWidth: 1,
    segments: [createSegment(frame, "spinner")],
  };
};

const barCell = (snapshot: TaskSnapshot): CellModel => {
  if (snapshot.units._tag !== "DeterminateTaskUnits") {
    return {
      id: "bar",
      segments: [],
    };
  }

  const { config } = snapshot;
  const units = snapshot.units;
  const bracketWidth = textWidth(config.leftBracket) + textWidth(config.rightBracket);
  const preferredInnerWidth = Math.max(1, config.barWidth);
  const intrinsicWidth = bracketWidth + preferredInnerWidth;

  return {
    id: "bar",
    track: Track.auto(),
    minWidth: Math.max(1, bracketWidth + 1),
    wrapMode: "truncate",
    collapsePriority: 10,
    intrinsicWidth,
    segments: [],
    renderAtWidth: (width) => {
      const targetWidth = Math.max(1, Math.floor(width));
      const safeTotal = units.total <= 0 ? 1 : units.total;
      const ratio = Math.min(1, Math.max(0, units.completed / safeTotal));

      const resolvedInnerWidth = Math.max(1, targetWidth - bracketWidth);
      const clampedRatio = snapshot.status === "done" ? 1 : ratio;
      const filled = Math.round(clampedRatio * resolvedInnerWidth);

      const fillRole: ThemeRole =
        snapshot.status === "failed"
          ? "statusFailed"
          : snapshot.status === "done"
            ? "statusDone"
            : "barFill";

      const emptyRole: ThemeRole = snapshot.status === "failed" ? "statusFailed" : "barEmpty";

      return [
        createSegment(config.leftBracket, "barBracket"),
        createSegment(config.fillChar.repeat(filled), fillRole),
        createSegment(config.emptyChar.repeat(Math.max(0, resolvedInnerWidth - filled)), emptyRole),
        createSegment(config.rightBracket, "barBracket"),
      ];
    },
  };
};

const unitsCell = (snapshot: TaskSnapshot): CellModel => ({
  id: "units",
  track: Track.auto(),
  minWidth: 3,
  wrapMode: "truncate",
  collapsePriority: 40,
  segments:
    snapshot.units._tag === "DeterminateTaskUnits"
      ? [createSegment(`${snapshot.units.completed}/${snapshot.units.total}`, "units")]
      : [],
});

const etaCell = (snapshot: TaskSnapshot, now: number): CellModel => ({
  id: "eta",
  track: Track.auto(),
  minWidth: 4,
  wrapMode: "truncate",
  collapsePriority: 20,
  segments: [createSegment(formatEta(snapshot, now), "eta")],
});

const elapsedCell = (snapshot: TaskSnapshot, now: number): CellModel => ({
  id: "elapsed",
  track: Track.auto(),
  minWidth: 4,
  wrapMode: "truncate",
  collapsePriority: 30,
  segments: [createSegment(formatElapsed(snapshot, now), "elapsed")],
});

const statusCell = (snapshot: TaskSnapshot): CellModel => {
  if (snapshot.status === "done") {
    return {
      id: "status",
      track: Track.auto(),
      minWidth: 6,
      wrapMode: "truncate",
      collapsePriority: 60,
      segments: [createSegment("done", "statusDone")],
    };
  }

  if (snapshot.status === "failed") {
    return {
      id: "status",
      track: Track.auto(),
      minWidth: 8,
      wrapMode: "truncate",
      collapsePriority: 60,
      segments: [createSegment("[failed]", "statusFailed")],
    };
  }

  return {
    id: "status",
    segments: [],
  };
};

const defaultBuildStageService: BuildStageService = {
  buildFrame: ({ orderedTasks, rendererConfig, now, tick }) => {
    // Build stage emits semantic rows only. No ANSI and no width trimming here.
    const orderedWithTree = computeTreeInfo(
      orderedTasks.map((entry) => ({ snapshot: entry.snapshot, depth: entry.depth })),
    );

    const taskBlocks: Array<TaskBlockModel> = orderedWithTree.map((entry, index) => {
      const orderedEntry = orderedTasks[index]!;
      const snapshot = orderedEntry.snapshot;
      const tree = entry.tree;
      const isDeterminate = snapshot.units._tag === "DeterminateTaskUnits";
      const showTwoLineDeterminate =
        isDeterminate && rendererConfig.determinateTaskLayout === "two-lines";

      const runningOrDoneDeterminate =
        isDeterminate && (snapshot.status === "running" || snapshot.status === "done");

      const determinateFailure = isDeterminate && snapshot.status === "failed";

      const rows: Array<LogicalRow> = [];

      if (runningOrDoneDeterminate) {
        if (showTwoLineDeterminate) {
          rows.push({
            lineVariant: "lead",
            cells: [treeCell(tree, "lead"), textCell(snapshot.description)],
          });

          rows.push({
            lineVariant: "continuation",
            cells: [
              treeCell(tree, "continuation"),
              barCell(snapshot),
              unitsCell(snapshot),
              snapshot.status === "running" ? etaCell(snapshot, now) : elapsedCell(snapshot, now),
            ],
          });
        } else {
          rows.push({
            lineVariant: "lead",
            cells: [
              treeCell(tree, "lead"),
              textCell(snapshot.description),
              barCell(snapshot),
              unitsCell(snapshot),
              snapshot.status === "running" ? etaCell(snapshot, now) : elapsedCell(snapshot, now),
            ],
          });
        }
      } else if (determinateFailure) {
        if (showTwoLineDeterminate) {
          rows.push({
            lineVariant: "lead",
            cells: [treeCell(tree, "lead"), textCell(snapshot.description)],
          });
          rows.push({
            lineVariant: "continuation",
            cells: [
              treeCell(tree, "continuation"),
              barCell(snapshot),
              unitsCell(snapshot),
              statusCell(snapshot),
              elapsedCell(snapshot, now),
            ],
          });
        } else {
          rows.push({
            lineVariant: "lead",
            cells: [
              treeCell(tree, "lead"),
              textCell(snapshot.description),
              barCell(snapshot),
              unitsCell(snapshot),
              statusCell(snapshot),
              elapsedCell(snapshot, now),
            ],
          });
        }
      } else if (snapshot.status === "running") {
        rows.push({
          lineVariant: "lead",
          cells: [
            treeCell(tree, "lead"),
            spinnerCell(snapshot, tick),
            textCell(snapshot.description),
            elapsedCell(snapshot, now),
          ],
        });
      } else {
        rows.push({
          lineVariant: "lead",
          cells: [
            treeCell(tree, "lead"),
            textCell(snapshot.description),
            statusCell(snapshot),
            elapsedCell(snapshot, now),
          ],
        });
      }

      return {
        taskId: snapshot.id as number,
        depth: orderedEntry.depth,
        theme: orderedEntry.theme,
        rows,
      };
    });

    return {
      taskBlocks,
    };
  },
};

const defaultShrinkStageService: ShrinkStageService = {
  fitFrame: ({ frame, width }) => {
    // Convert logical rows into concrete widths and fitted segments.
    const totalWidth = resolveTotalWidth(width);

    return {
      taskBlocks: frame.taskBlocks.map((block) => ({
        taskId: block.taskId,
        rows: block.rows.map((row) => {
          const gap = Math.max(0, Math.floor(row.gap ?? 1));
          const widths = resolveRowWidths(row, totalWidth);

          return {
            depth: block.depth,
            theme: block.theme,
            gap,
            cells: row.cells.map((cell, index) => {
              const widthForCell = widths[index] ?? 0;
              const rendered = cell.renderAtWidth?.(widthForCell) ?? cell.segments;
              const wrapMode = cell.wrapMode ?? "truncate";
              const fittedSegments = fitSegments(rendered, widthForCell, wrapMode);

              return {
                id: cell.id,
                width: widthForCell,
                segments: fittedSegments,
              };
            }),
          };
        }),
      })),
    };
  },
};

const styleSegment = (segment: Segment, depth: number, theme: ThemeService): string => {
  const byDepth = theme.depthPalette?.(depth, segment.role);
  if (byDepth !== undefined) {
    return byDepth(segment.text);
  }

  const style = theme.styles[segment.role] ?? theme.styles.plain;
  return style(segment.text);
};

const defaultColorStageService: ColorStageService = {
  colorFrame: ({ frame }) =>
    frame.taskBlocks.flatMap((block) =>
      block.rows.map((row) => {
        const gap = " ".repeat(row.gap);
        return row.cells
          .map((cell) =>
            cell.segments.map((segment) => styleSegment(segment, row.depth, row.theme)).join(""),
          )
          .join(gap)
          .trimEnd();
      }),
    ),
};

const makeDefaultFrameRenderer = (
  buildStage: BuildStageService,
  shrinkStage: ShrinkStageService,
  colorStage: ColorStageService,
  fallbackTheme: ThemeService,
): FrameRendererService => ({
  run: ({
    storeRef,
    logsRef,
    pendingLogsRef,
    dirtyRef,
    terminal,
    isTTY,
    rendererConfig,
    maxRetainedLogLines,
  }) =>
    Effect.gen(function* () {
      // The frame renderer owns terminal state (cursor/session), drives tick
      // updates, and coordinates build -> shrink -> color for each frame.
      const retainLogHistory = maxRetainedLogLines > 0;
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

        yield* terminal.writeStderr("\n" + SHOW_CURSOR);
        previousLineCount = 0;
        sessionActive = false;
      });

      const renderNonTTYTaskUpdates = (
        ordered: ReadonlyArray<{
          snapshot: TaskSnapshot;
          lines: ReadonlyArray<string>;
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
            changedTaskLines.push(...ordered[i]!.lines);
          }
        }

        return Effect.gen(function* () {
          if (changedTaskLines.length > 0) {
            yield* terminal.writeStderr(changedTaskLines.join("\n") + "\n");
          }

          nonTTYTaskSignatureById = nextTaskSignatureById;
        });
      };

      const renderFrame = (mode: "tick" | "final") =>
        Effect.gen(function* () {
          // Materialize one frame snapshot from current state.
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
                theme: store.themes.get(snapshot.id) ?? fallbackTheme,
              },
            ];
          });

          const now = yield* Clock.currentTimeMillis;
          const frameTick = mode === "final" ? tick + 1 : tick;
          const terminalColumns = isTTY ? yield* terminal.stderrColumns : undefined;
          const maxTaskWidth = rendererConfig.maxTaskWidth;

          const frameModel = buildStage.buildFrame({
            orderedTasks,
            rendererConfig,
            now,
            tick: isTTY ? frameTick : 0,
          });

          const fittedFrame = shrinkStage.fitFrame({
            frame: frameModel,
            width: {
              terminalColumns,
              maxTaskWidth,
            },
          });

          const taskLines = colorStage.colorFrame({ frame: fittedFrame });

          const taskLineMap = new Map<number, ReadonlyArray<string>>();
          let lineCursor = 0;
          for (const block of fittedFrame.taskBlocks) {
            const lineCount = block.rows.length;
            taskLineMap.set(block.taskId, taskLines.slice(lineCursor, lineCursor + lineCount));
            lineCursor += lineCount;
          }

          if (isTTY) {
            let frame = "";

            if (previousLineCount > 0) {
              frame += "\r" + CLEAR_LINE;
              for (let i = 1; i < previousLineCount; i++) {
                frame += MOVE_UP_ONE + CLEAR_LINE;
              }
            }

            if (retainLogHistory) {
              const historyLogs = yield* Ref.get(logsRef);
              const lines = yield* clipTTYFrameLines([...historyLogs, ...taskLines]);
              if (lines.length > 0) {
                frame += lines.join("\n");
              }
              previousLineCount = lines.length;
            } else {
              if (drainedLogs.length > 0) {
                frame += drainedLogs.join("\n") + "\n";
              }
              if (taskLines.length > 0) {
                frame += taskLines.join("\n");
              }
              previousLineCount = taskLines.length;
            }

            if (frame) {
              yield* terminal.writeStderr(frame);
            }
            return;
          }

          if (drainedLogs.length > 0) {
            yield* terminal.writeStderr(drainedLogs.join("\n") + "\n");
          }

          const orderedForNonTTY = orderedTasks.map((task) => ({
            snapshot: task.snapshot,
            lines: taskLineMap.get(task.snapshot.id as number) ?? [],
          }));
          yield* renderNonTTYTaskUpdates(orderedForNonTTY);
        });

      const renderLoop = Effect.gen(function* () {
        // Tick loop: render eagerly in TTY mode for spinner animation, and
        // render opportunistically in non-TTY mode based on signatures/dirty bit.
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

export class BuildStage extends Context.Tag("stromseng.dev/effective-progress/BuildStage")<
  BuildStage,
  BuildStageService
>() {
  static readonly Default = Layer.succeed(BuildStage, BuildStage.of(defaultBuildStageService));
}

export class ShrinkStage extends Context.Tag("stromseng.dev/effective-progress/ShrinkStage")<
  ShrinkStage,
  ShrinkStageService
>() {
  static readonly Default = Layer.succeed(ShrinkStage, ShrinkStage.of(defaultShrinkStageService));
}

export class ColorStage extends Context.Tag("stromseng.dev/effective-progress/ColorStage")<
  ColorStage,
  ColorStageService
>() {
  static readonly Default = Layer.succeed(ColorStage, ColorStage.of(defaultColorStageService));
}

export class FrameRenderer extends Context.Tag("stromseng.dev/effective-progress/FrameRenderer")<
  FrameRenderer,
  FrameRendererService
>() {
  static readonly Default = Layer.effect(
    FrameRenderer,
    Effect.gen(function* () {
      const buildStage = yield* BuildStage;
      const shrinkStage = yield* ShrinkStage;
      const colorStage = yield* ColorStage;
      const theme = yield* Theme;
      return FrameRenderer.of(makeDefaultFrameRenderer(buildStage, shrinkStage, colorStage, theme));
    }),
  );
}
