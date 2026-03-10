import { Box, type DOMElement } from "ink";
import { useMemo, useRef } from "react";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useNow } from "../now-context";
import { useRenderFrame } from "../render-frame-context";
import {
  DescriptionColumn,
  hasRenderableProgress,
  minTreeDescriptionWidth,
  preferredDescriptionWidthForCap,
} from "./description-column";
import { ElapsedColumn, MIN_ELAPSED_WIDTH, preferredElapsedWidth } from "./elapsed-column";
import { EtaColumn, etaMinimumWidth, hasEta, preferredEtaWidth } from "./eta-column";
import {
  COLUMN_GAP,
  assignedWidthsForMeasures,
  rootLayoutMeasures,
  selectRootLayoutPolicy,
} from "./layout-policy";
import {
  preferredPercentWidth,
  preferredProgressWidth,
  progressMinimumWidth,
} from "./progress-column";
import { ProgressColumn } from "./progress-column";

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
  const percentPreferredWidth = useMemo(() => preferredPercentWidth(frame.rows), [frame.rows]);
  const elapsedPreferredWidth = useMemo(() => preferredElapsedWidth(frame.rows, now), [frame.rows, now]);
  const etaMinWidth = useMemo(() => etaMinimumWidth(frame.rows, now), [frame.rows, now]);
  const etaPreferredWidth = useMemo(() => preferredEtaWidth(frame.rows, now), [frame.rows, now]);
  const descriptionTreeMinWidth = useMemo(() => minTreeDescriptionWidth(frame.rows), [frame.rows]);
  const progressPreferred = useMemo(() => preferredProgressWidth(frame.rows), [frame.rows]);
  const progressFullMinWidth = useMemo(() => progressMinimumWidth(frame.rows), [frame.rows]);
  const layoutPolicy = useMemo(
    () =>
      selectRootLayoutPolicy({
        terminalColumns: rootWidth,
        hasProgress: showProgress,
        hasEta: showEtaColumn,
        preferDroppingEtaBeforePercent: etaMinWidth > 3,
        descriptionPreferredWidth: preferredDescriptionWidthForCap(frame.rows, "tree"),
        descriptionTreeMinWidth,
        elapsedMinWidth: MIN_ELAPSED_WIDTH,
        elapsedPreferredWidth,
        etaMinWidth,
        etaPreferredWidth,
        percentWidth: percentPreferredWidth,
        progressPreferredWidth: progressPreferred,
        progressFullMinWidth,
      }),
    [
      descriptionTreeMinWidth,
      elapsedPreferredWidth,
      etaMinWidth,
      etaPreferredWidth,
      frame.rows,
      percentPreferredWidth,
      progressPreferred,
      progressFullMinWidth,
      rootWidth,
      showEtaColumn,
      showProgress,
    ],
  );
  const measures = useMemo(
    () =>
      rootLayoutMeasures(layoutPolicy, {
        hasProgress: showProgress,
        hasEta: showEtaColumn,
        descriptionPreferredWidth: preferredDescriptionWidthForCap(
          frame.rows,
          layoutPolicy.descriptionCap,
        ),
        descriptionTreeMinWidth,
        elapsedMinWidth: MIN_ELAPSED_WIDTH,
        elapsedPreferredWidth,
        etaMinWidth,
        etaPreferredWidth,
        percentWidth: percentPreferredWidth,
        progressPreferredWidth: progressPreferred,
        progressFullMinWidth,
      }),
    [
      descriptionTreeMinWidth,
      elapsedPreferredWidth,
      etaMinWidth,
      etaPreferredWidth,
      frame.rows,
      layoutPolicy,
      percentPreferredWidth,
      progressPreferred,
      progressFullMinWidth,
      showEtaColumn,
      showProgress,
    ],
  );
  const assignedWidths = useMemo(
    () => assignedWidthsForMeasures(measures, rootWidth),
    [measures, rootWidth],
  );

  return (
    <Box ref={rootRef} flexDirection="row" width={terminalColumns}>
      <DescriptionColumn
        cap={layoutPolicy.descriptionCap}
        assignedWidth={assignedWidths.get("description")}
        marginRight={
          layoutPolicy.progressMode !== undefined || layoutPolicy.showElapsed || layoutPolicy.showEta
            ? COLUMN_GAP
            : 0
        }
      />
      {showProgress && layoutPolicy.progressMode !== undefined ? (
        <ProgressColumn
          mode={layoutPolicy.progressMode}
          assignedWidth={assignedWidths.get("progress")}
          marginRight={layoutPolicy.showElapsed || layoutPolicy.showEta ? COLUMN_GAP : 0}
        />
      ) : null}
      {layoutPolicy.showElapsed ? (
        <ElapsedColumn
          assignedWidth={assignedWidths.get("elapsed")}
          marginRight={layoutPolicy.showEta && showEtaColumn ? COLUMN_GAP : 0}
        />
      ) : null}
      {layoutPolicy.showEta && showEtaColumn ? (
        <EtaColumn assignedWidth={assignedWidths.get("eta")} />
      ) : null}
    </Box>
  );
};
