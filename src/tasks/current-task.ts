import { Context } from "effect";
import type { TaskId } from "../task-model";

export class Task extends Context.Service<Task, TaskId>()(
  "stromseng.dev/effective-progress/Task",
) {}
