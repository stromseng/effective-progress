import { Effect } from "effect";
import { makePerformanceWorkload } from "./helpers/performance-workload";

const { progressRun } = makePerformanceWorkload("short");
await Effect.runPromise(progressRun);
