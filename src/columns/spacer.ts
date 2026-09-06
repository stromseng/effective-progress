import type { ColumnDef } from "../types";

export interface SpacerOptions {
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly minWidth?: number;
}

export const spacer = <M = unknown>({
  flexGrow,
  flexShrink,
  flexBasis,
  minWidth,
}: SpacerOptions = {}): ColumnDef<M> => ({
  render: () => null,
  flexGrow,
  flexShrink,
  flexBasis,
  minWidth,
});
