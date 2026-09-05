import { Effect } from "effect";
import { makePerformanceWorkload } from "./helpers/performance-workload";

const { progressRun } = makePerformanceWorkload("long");
await Effect.runPromise(progressRun);
