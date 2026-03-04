import { Effect } from "effect";
import * as Progress from "../src";

const program = Progress.task(Effect.sleep("5 seconds"), {
  description: "Running indeterminate task for 5 seconds",
  total: 0,
  transient: false,
});

Effect.runPromise(program);
