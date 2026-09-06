# Anti-slop Oxlint rules

Vendored from https://github.com/dmmulroy/anti-slop at commit `e8c4880471b23ab7f216fba7b27d173a6ef07d4c` (MIT).
Only runtime rule sources are copied; no agent skill is installed.

Both plugin entry points are registered in `.oxlintrc.json`. Keep `oxlint` and
`@oxlint/plugins` pinned to the same version when upgrading.

To update, copy upstream `src/` here excluding `*.test.ts`, preserve the license,
and update the commit above. Run `bun run check` and `bun test` after updating.

Local adaptation: `shared/dictionary-types.ts` coalesces the first intersection
member to `null` for this project’s `noUncheckedIndexedAccess` setting.
