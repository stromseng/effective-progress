import { createDescriptionColumn } from "../../src/rendererv2/columns/description-column";
import { createElapsedColumn } from "../../src/rendererv2/columns/elapsed-column";
import { createEtaColumn } from "../../src/rendererv2/columns/eta-column";
import { createProgressColumn } from "../../src/rendererv2/columns/progress-column";
import { createRendererv2InkRenderer } from "../../src/rendererv2/ink-renderer";

const columns = [
  createDescriptionColumn(),
  createProgressColumn(),
  createElapsedColumn(),
  createEtaColumn(),
];

export const rendererv2Renderer = createRendererv2InkRenderer(columns);
