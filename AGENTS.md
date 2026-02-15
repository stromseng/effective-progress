# AGENTS.md

## Project

**effective-progress** — An Effect-first terminal progress bar library for CLI applications. Provides composable APIs for multiple concurrent progress bars, nested tasks, spinners, and integrated logging.

Pre-1.0.0 — breaking changes may occur between minor versions.

## Tech Stack

- **Runtime:** Node.js with Effect (^3.19.17)
- **Language:** TypeScript (strict mode, ESNext)
- **Package manager:** Bun
- **Test runner:** Bun (`bun test`)
- **Linter:** oxlint (`bun run lint`)
- **Formatter:** oxfmt (`bun run format`, `bun run format:check`)
- **Type checking:** `bun run typecheck`

## Commands

```bash
bun test              # Run all tests
bun run typecheck     # Type-check without emitting
bun run lint          # Lint with oxlint
bun run format        # Format with oxfmt
bun run format:check  # Check formatting
```

## Project Structure

```
index.ts          # Package entry point (re-exports src/)
src/
  index.ts        # Public API barrel file
  api.ts          # High-level APIs: task(), all(), forEach()
  runtime.ts      # ProgressService implementation (task lifecycle, state)
  types.ts        # Type definitions & Effect Schemas
  renderer.ts     # ANSI rendering (progress bars, spinners, nesting)
  terminal.ts     # Terminal I/O abstraction (TTY detection, stderr)
  console.ts      # Progress-aware Console layer
  colors.ts       # Color system (named, hex, RGB, ANSI256)
  utils.ts        # Helpers (inferTotal)
tests/            # Bun tests (*.test.ts)
examples/         # Runnable demos (bun examples/<name>.ts)
docs/             # VHS tape definitions & generated GIFs
```
