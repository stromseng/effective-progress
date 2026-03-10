import type { Column, RenderFrameContextValue, WidthMeasure } from "./node";

export type StickyWidthKey = symbol;

export interface StickyWidthOptions {
  readonly key: StickyWidthKey;
  readonly measure: WidthMeasure;
  readonly stickyWidths: Map<StickyWidthKey, number>;
}

export interface StickyColumnOptions {
  readonly frame: RenderFrameContextValue;
  readonly measure: WidthMeasure;
  readonly render: Column["render"];
  readonly stickyKey?: StickyWidthKey;
}

export const applyStickyWidth = ({
  key,
  measure,
  stickyWidths,
}: StickyWidthOptions): WidthMeasure => {
  const preferred = Math.max(measure.preferred, stickyWidths.get(key) ?? 0);
  const max = measure.max === undefined ? undefined : Math.max(measure.max, preferred);
  return { ...measure, preferred, max };
};

export const commitStickyWidth = ({ key, measure, stickyWidths }: StickyWidthOptions): void => {
  stickyWidths.set(key, measure.preferred);
};

export const createStickyColumn = ({
  frame,
  measure: baseMeasure,
  render,
  stickyKey,
}: StickyColumnOptions): Column => {
  const measure =
    stickyKey === undefined
      ? baseMeasure
      : applyStickyWidth({
          key: stickyKey,
          measure: baseMeasure,
          stickyWidths: frame.stickyWidths,
        });

  return {
    measure,
    commitStickyWidth:
      stickyKey === undefined
        ? undefined
        : () => {
            commitStickyWidth({
              key: stickyKey,
              measure,
              stickyWidths: frame.stickyWidths,
            });
          },
    render,
  };
};
