Renderer v2 sketch area.

This directory is intentionally not wired into the current renderer.

Files here capture a Rich-style possible v2 shape where:

- Columns are definition objects with both render and measurement logic.
- The renderer measures columns, assigns widths, and renders with explicit cell widths.
- Flexible columns shrink first; sticky columns reclaim width when space returns.

Current sketches:

- `public-api.sketch.tsx`: renderer-facing column definition API
- `width-allocator.sketch.ts`: Rich-style width planning and sticky reclaim
- `ink-renderer.sketch.tsx`: adapter that runs the v2 renderer through the real Progress store

Example usage lives in `examples/showcaseRendererv2.tsx`.
