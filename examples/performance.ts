import { Effect } from "effect";
import { createPerformanceWorkload } from "./helpers/performance-workload";

const { progressRun } = createPerformanceWorkload("short");
await Effect.runPromise(progressRun);
