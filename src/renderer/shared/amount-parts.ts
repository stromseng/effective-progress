import type { TaskSnapshot } from "../../task-model";

type AmountParts =
  | { readonly kind: "indicator"; readonly text: string }
  | {
      readonly kind: "counts";
      readonly detailed: boolean;
      readonly succeeded: string;
      readonly failed: string;
      readonly processed: string;
      readonly total: string;
    };

/** One presentation model shared by plain text, layout measurement, and colored cells. */
export const getAmountParts = (task: TaskSnapshot): AmountParts => {
  const { succeeded, failed, processed, total } = task.units;
  if (total === undefined && !(processed > 0)) {
    return { kind: "indicator", text: task.status === "failed" ? "✗" : "" };
  }
  const totalText = total === undefined ? "?" : String(total);
  const countWidth = total === undefined ? 0 : totalText.length;
  return {
    kind: "counts",
    detailed: task.countDisplay === "detailed",
    succeeded: String(succeeded).padStart(countWidth, " "),
    failed: String(failed).padStart(countWidth, " "),
    processed: String(processed),
    total: totalText,
  };
};
