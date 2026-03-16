import { Effect, Logger } from "effect";
import * as Progress from "../src";

const sleep = (millis: number) => Effect.sleep(`${millis} millis`);

const padRight = (value: string, width: number) => value.padEnd(Math.max(width, value.length), " ");

interface BuildMeta {
  readonly branch: string;
  readonly artifact: string;
}

interface MigrationMeta {
  readonly database: string;
  readonly step: string;
}

interface CacheMeta {
  readonly region: string;
  readonly phase: string;
}

const buildBranchColumn = (): Progress.ColumnDef<BuildMeta, number> => ({
  prepare: (rows) =>
    rows.reduce((max, row) => Math.max(max, row.task.metadata.branch.length), "Branch".length),
  flexShrink: 0,
  minWidth: (prepared) => prepared,
  render: ({ task }, { prepared }) => padRight(task.metadata.branch, prepared),
});

const buildArtifactColumn = (): Progress.ColumnDef<BuildMeta, number> => ({
  prepare: (rows) =>
    rows.reduce((max, row) => Math.max(max, row.task.metadata.artifact.length), "Artifact".length),
  flexShrink: 0,
  minWidth: (prepared) => prepared,
  render: ({ task }, { prepared }) => padRight(task.metadata.artifact, prepared),
});

const migrationDatabaseColumn = (): Progress.ColumnDef<MigrationMeta, number> => ({
  prepare: (rows) =>
    rows.reduce((max, row) => Math.max(max, row.task.metadata.database.length), "Database".length),
  flexShrink: 0,
  minWidth: (prepared) => prepared,
  render: ({ task }, { prepared }) => padRight(task.metadata.database, prepared),
});

const migrationStepColumn = (): Progress.ColumnDef<MigrationMeta> => ({
  flexShrink: 0,
  minWidth: 12,
  render: ({ task }) => task.metadata.step,
});

const cacheRegionColumn = (): Progress.ColumnDef<CacheMeta> => ({
  flexShrink: 0,
  minWidth: 10,
  render: ({ task }) => task.metadata.region,
});

const cachePhaseColumn = (): Progress.ColumnDef<CacheMeta> => ({
  align: "center",
  flexShrink: 0,
  minWidth: 12,
  render: ({ task }) => task.metadata.phase,
});

const buildColumns = (): ReadonlyArray<Progress.ColumnDef<BuildMeta, any>> => [
  Progress.Columns.description(),
  Progress.Columns.bar(),
  buildBranchColumn(),
  buildArtifactColumn(),
  Progress.Columns.amount(),
  Progress.Columns.elapsed(),
];

const migrationColumns = (): ReadonlyArray<Progress.ColumnDef<MigrationMeta, any>> => [
  Progress.Columns.description(),
  Progress.Columns.bar(),
  migrationDatabaseColumn(),
  migrationStepColumn(),
  Progress.Columns.amount(),
  Progress.Columns.elapsed(),
];

const cacheColumns = (): ReadonlyArray<Progress.ColumnDef<CacheMeta, any>> => [
  Progress.Columns.description(),
  Progress.Columns.bar(),
  cacheRegionColumn(),
  cachePhaseColumn(),
  Progress.Columns.amount(),
  Progress.Columns.elapsed(),
];

const buildFrontend = Progress.task(
  (task) =>
    Effect.gen(function* () {
      yield* sleep(300);
      yield* task.incrementSucceeded();
      yield* task.update({
        description: "Build frontend bundle",
      });

      yield* task.setMetadata({
        branch: "release/2026.03",
        artifact: "frontend.tar.gz",
      });
      yield* sleep(300);
      yield* task.incrementSucceeded();
      yield* sleep(300);
      yield* task.incrementSucceeded();
    }),
  {
    description: "Build frontend",
    total: 3,
    metadata: {
      branch: "release/2026.03",
      artifact: "frontend.tar.gz",
    } satisfies BuildMeta,
    columns: buildColumns(),
  },
);

const buildWorker = Progress.task(
  (task) =>
    Effect.gen(function* () {
      yield* sleep(250);
      yield* task.incrementSucceeded();
      yield* task.setMetadata({
        branch: "main",
        artifact: "worker-linux-amd64",
      });
      yield* sleep(250);
      yield* task.incrementSucceeded();
      yield* sleep(250);
      yield* task.incrementSucceeded();
    }),
  {
    description: "Build worker image",
    total: 3,
    metadata: {
      branch: "main",
      artifact: "worker-linux-amd64",
    } satisfies BuildMeta,
    columns: buildColumns(),
  },
);

const migrateUsers = Progress.task(
  (task) =>
    Effect.gen(function* () {
      yield* sleep(250);
      yield* task.incrementSucceeded();
      yield* task.setMetadata({
        database: "users-primary",
        step: "backfill emails",
      });
      yield* sleep(250);
      yield* task.incrementSucceeded();
      yield* sleep(250);
      yield* task.incrementSucceeded();
      yield* sleep(250);
      yield* task.incrementSucceeded();
    }),
  {
    description: "Run user migrations",
    total: 4,
    metadata: {
      database: "users-primary",
      step: "copy profiles",
    } satisfies MigrationMeta,
    columns: migrationColumns(),
  },
);

const warmCache = Progress.task(
  (task) =>
    Effect.gen(function* () {
      yield* sleep(300);
      yield* task.incrementSucceeded();
      yield* task.setMetadata({
        region: "eu-west-1",
        phase: "warming",
      });
      yield* sleep(300);
      yield* task.incrementSucceeded();
    }),
  {
    description: "Warm cache nodes",
    total: 2,
    metadata: {
      region: "eu-west-1",
      phase: "priming",
    } satisfies CacheMeta,
    columns: cacheColumns(),
  },
);

const program = Progress.task(
  Effect.gen(function* () {
    yield* Progress.all([buildFrontend, buildWorker], {
      description: "Build artifacts",
      concurrency: 2,
    });

    yield* Progress.all([migrateUsers, warmCache], {
      description: "Roll out release",
      concurrency: 2,
    });
  }),
  {
    description: "Deploy release 2026.03",
  },
);

Effect.runPromise(program.pipe(Effect.provide(Logger.pretty)));
