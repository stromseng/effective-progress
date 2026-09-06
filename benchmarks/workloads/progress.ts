import { Effect } from "effect";
import { createPerformanceWorkload } from "./workload";

const { progressRun } = createPerformanceWorkload("short");
await Effect.runPromise(progressRun);
