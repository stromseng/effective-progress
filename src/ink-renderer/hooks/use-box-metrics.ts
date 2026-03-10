import { type DOMElement, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

interface BoxMetrics {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

interface UseBoxMetricsResult extends BoxMetrics {
  readonly hasMeasured: boolean;
}

const EMPTY_METRICS: BoxMetrics = {
  width: 0,
  height: 0,
  left: 0,
  top: 0,
};

export const useBoxMetrics = (ref: RefObject<DOMElement | null>): UseBoxMetricsResult => {
  const [metrics, setMetrics] = useState<BoxMetrics>(EMPTY_METRICS);
  const [hasMeasured, setHasMeasured] = useState(false);
  const { stdout } = useStdout();

  const updateMetrics = useCallback(() => {
    const layout = ref.current?.yogaNode?.getComputedLayout() ?? EMPTY_METRICS;

    setMetrics((current) => {
      if (
        current.width === layout.width &&
        current.height === layout.height &&
        current.left === layout.left &&
        current.top === layout.top
      ) {
        return current;
      }

      return {
        width: layout.width,
        height: layout.height,
        left: layout.left,
        top: layout.top,
      };
    });
    setHasMeasured(Boolean(ref.current));
  }, [ref]);

  useEffect(updateMetrics);

  useEffect(() => {
    stdout.on("resize", updateMetrics);

    return () => {
      stdout.off("resize", updateMetrics);
    };
  }, [stdout, updateMetrics]);

  return useMemo(
    () => ({
      ...metrics,
      hasMeasured,
    }),
    [hasMeasured, metrics],
  );
};
