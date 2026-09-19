import type { Column } from "./types";

export interface SpacerOptions {
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly minWidth?: number;
}

export const spacer = ({
  flexGrow,
  flexShrink,
  flexBasis,
  minWidth,
}: SpacerOptions = {}): Column<unknown> => ({
  render: () => null,
  flexGrow,
  flexShrink,
  flexBasis,
  minWidth,
});
