import { Context } from "effect";
import type { TaskId } from "./model";

/** The ID of the task whose scope the running effect is inside. */
export class CurrentTask extends Context.Service<CurrentTask, TaskId>()(
  "stromseng.dev/effective-progress/CurrentTask",
) {}
