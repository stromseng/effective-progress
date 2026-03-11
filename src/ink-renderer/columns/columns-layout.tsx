import { Box, type DOMElement } from "ink";
import { useMemo, useRef } from "react";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useNow } from "../now-context";
import { useRenderFrame } from "../render-frame-context";
import {
  DescriptionColumn,
  descriptionColumnMeasure,
  hasRenderableProgress,
} from "./description-column";
import { ElapsedColumn, elapsedColumnMeasure } from "./elapsed-column";
import { EtaColumn, etaColumnMeasure, hasEta } from "./eta-column";
import { COLUMN_GAP, assignedWidthsForMeasures } from "./layout-policy";
import { progressColumnMeasure, ProgressColumn } from "./progress-column";

interface ColumnsLayoutProps {
  readonly terminalColumns: number | undefined;
}

export const ColumnsLayout = ({ terminalColumns }: ColumnsLayoutProps) => {
  const frame = useRenderFrame();
  const now = useNow();
  const rootRef = useRef<DOMElement>(null);
  const rootMetrics = useBoxMetrics(rootRef);
  const rootWidth = terminalColumns ?? (rootMetrics.hasMeasured ? rootMetrics.width : undefined);
  const showProgress = useMemo(() => hasRenderableProgress(frame.rows), [frame.rows]);
  const showEtaColumn = useMemo(() => hasEta(frame.rows, now), [frame.rows, now]);
  const measures = useMemo(
    () => [
      descriptionColumnMeasure(frame.rows),
      ...(showProgress ? [progressColumnMeasure(frame.rows)] : []),
      elapsedColumnMeasure(frame.rows, now),
      ...(showEtaColumn ? [etaColumnMeasure(frame.rows, now)] : []),
    ],
    [frame.rows, now, showEtaColumn, showProgress],
  );
  const assignedWidths = useMemo(
    () => assignedWidthsForMeasures(measures, rootWidth),
    [measures, rootWidth],
  );
  const marginRightFor = (id: (typeof measures)[number]["id"]): number => {
    const currentIndex = measures.findIndex((measure) => measure.id === id);
    if (currentIndex < 0) {
      return 0;
    }

    return measures.slice(currentIndex + 1).some((measure) => (assignedWidths.get(measure.id) ?? 0) > 0)
      ? COLUMN_GAP
      : 0;
  };

  return (
    <Box ref={rootRef} flexDirection="row" width={terminalColumns}>
      <DescriptionColumn
        assignedWidth={assignedWidths.get("description")}
        marginRight={marginRightFor("description")}
      />
      {showProgress ? (
        <ProgressColumn
          assignedWidth={assignedWidths.get("progress")}
          marginRight={marginRightFor("progress")}
        />
      ) : null}
      <ElapsedColumn
        assignedWidth={assignedWidths.get("elapsed")}
        marginRight={marginRightFor("elapsed")}
      />
      {showEtaColumn ? (
        <EtaColumn assignedWidth={assignedWidths.get("eta")} />
      ) : null}
    </Box>
  );
};
