import type { ProgressColumnDefinition, ProgressColumnProps } from "../public-api";
import { TaskIndicatorGlyph } from "./task-indicator";

export interface StatusColumnConfig {
  readonly width: number;
  readonly paddingRight: number;
}

export const createStatusColumn = (config: StatusColumnConfig): ProgressColumnDefinition => {
  const Component = ({ row }: ProgressColumnProps) => <TaskIndicatorGlyph task={row.task} />;

  return {
    Component,
    measure: () => ({
      minWidth: config.width,
      preferredWidth: config.width,
      maxWidth: config.width,
    }),
    fixedWidth: config.width,
    paddingRight: config.paddingRight,
    noWrap: true,
  };
};
