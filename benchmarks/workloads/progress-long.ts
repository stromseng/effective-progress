import { Effect } from "effect";
import { createPerformanceWorkload } from "./workload";

const { progressRun } = createPerformanceWorkload("long");
await Effect.runPromise(progressRun);
