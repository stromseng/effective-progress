# Automation Oxlint rules

Selected rule sources copied from [typeonce-dev/ai-automation](https://github.com/typeonce-dev/ai-automation/tree/0bca096fe6fe9878cd15303a623dd2cd85915ddd/rules/oxlint)
at commit `0bca096fe6fe9878cd15303a623dd2cd85915ddd`.
No skill, typed-lint engine, or other automation scripts are installed.

The 22 rules registered in `index.ts` are enabled as errors in `.oxlintrc.json`.
They cover unsafe casts, Effect composition and capabilities, validation,
error handling, and component-local functions. Upstream rule implementations
are unchanged; the entry point registers only the selected rules. Upstream's
application-specific built-in policy and Tailwind dependencies are not copied.

## Exclusions

These policies are deliberately omitted to preserve this library's conventions
and API. They are not suppressed globally through lint-disable comments.

| Rules | Reason |
| --- | --- |
| `no-comments` | Comments and API documentation are encouraged; anti-slop also requires safety comments for assertions. |
| `no-multiple-function-params`, `no-optional-function-parameters` | Positional, optional, and dual/pipeable arguments are part of the public API and Effect conventions. |
| `private-function-prefix`, `no-single-use-private-functions` | Underscore naming and mandatory inlining conflict with the existing domain names and focused helpers. |
| `no-type-assertion` | Anti-slop's safety-comment rule allows justified generic API and mock-stream assertions; `no-banned-type-assertions` still forbids casts to any, unknown, or never. |
| `no-service-option` | Reusing an existing Progress, Renderer, or stdio service before providing defaults is intentional and tested. |
| `require-context-service-in-services` | The services tree also owns renderer hooks, components, and pure store helpers, not just service declarations. |
| `no-react-state-hooks` | Renderer clocks use local React state; the library does not use XState. |
| `no-react-non-component-function-exports` | Column factories return JSX and are intentionally exported alongside rendering helpers. |
| `no-reexport-only-modules` | `src/index.ts` is the package's public entry point. |
| `no-api-backend-imports`, `no-api-repository-imports`, `require-tsx-in-ui-folders` | This terminal library has no application contract/repository or web UI folder architecture. |
| All `xstate` and `next-tailwind` profile rules | Those frameworks and their architecture assumptions are absent. |

## Narrow overrides

- `use-now-clock.ts` and `use-spinner-clock.ts` may read `Date.now()` because
  they own the React timer boundary. Randomness remains prohibited there.
- `examples/benchmarks.ts` may serialize its own measurements with
  `JSON.stringify`; it does not parse external JSON. The rule stays enabled
  for the rest of the project.

## Maintenance

Copy selected files from upstream `rules/oxlint/src/rules/`, then update the
source commit above. Keep `index.ts`, `.oxlintrc.json`, and this exclusion list
in sync. Run `bun run check` and `bun test` after changes.

Vendored rules are excluded from linting and formatting so each ruleset does
not lint the other's implementation conventions. They remain typechecked,
and their entry points are registered with Knip for dependency analysis.
