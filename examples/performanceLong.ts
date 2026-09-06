import { Effect } from "effect";
import { createPerformanceWorkload } from "./helpers/performance-workload";

const { progressRun } = createPerformanceWorkload("long");
await Effect.runPromise(progressRun);
