# AGENTS.md

## Project

**effective-progress** — An Effect-first terminal progress bar library for CLI applications. Provides composable APIs for multiple concurrent progress bars, nested tasks, spinners, and integrated logging.

This is a greenfield project. Pre-1.0.0 — breaking changes are allowed to occur between minor versions.

## Tech Stack

- **Runtime:** Node.js with Effect
- **Language:** TypeScript (strict mode, ESNext)
- **Package manager:** Bun
- **Test runner:** Bun (`bun test`)
- **Linter:** oxlint (`bun run lint`)
- **Formatter:** oxfmt (`bun run format`, `bun run format:check`)
- **Type checking:** TypeScript 7 (TSGO) with `@effect/tsgo` via `bun run typecheck`

## Commands

```bash
bun test              # Run all tests
bun run typecheck     # Type-check without emitting
bun run lint          # Lint with oxlint
bun run format        # Format with oxfmt
bun run format:check  # Check formatting
```

## TypeScript tooling

`bun install` patches TypeScript 7 (`@typescript/native`) with the Effect language service.
Typechecking and the workspace editor use this native compiler. The `typescript` 5
dependency supplies the JavaScript compiler API required by Knip and tsdown.

For VS Code-based editors, install the TypeScript 7 extension and use the workspace
TypeScript version configured in `.vscode/settings.json`. The tsconfig plugin name
remains `@effect/language-service`; `@effect/tsgo` reads that configuration.
Knip ignores `@effect/language-service` and `@typescript/native` because the former
is a plugin configuration key and the latter is invoked by its file path.
