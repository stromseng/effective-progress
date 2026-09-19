# AGENTS.md

## Project

**effective-progress** — An Effect-first terminal progress bar library for CLI applications. Provides composable APIs for multiple concurrent progress bars, nested tasks, spinners, and integrated logging.

This is a greenfield project. Pre-1.0.0 — breaking changes are allowed to occur between minor versions.

## Vocabulary

Terms are defined in `CONTEXT.md`. Use those names in code, comments, tests, and docs. If a concept
needs a new word, add it there first.

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
