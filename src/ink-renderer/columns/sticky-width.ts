import type { WidthMeasure } from "./node";

export interface StickyWidthOptions {
  readonly key: string;
  readonly measure: WidthMeasure;
  readonly stickyWidths: Map<string, number>;
}

export const applyStickyWidth = ({
  key,
  measure,
  stickyWidths,
}: StickyWidthOptions): WidthMeasure => {
  const preferred = Math.max(measure.preferred, stickyWidths.get(key) ?? 0);
  const max = measure.max === undefined ? undefined : Math.max(measure.max, preferred);
  const nextMeasure = { ...measure, preferred, max };

  stickyWidths.set(key, nextMeasure.preferred);
  return nextMeasure;
};
