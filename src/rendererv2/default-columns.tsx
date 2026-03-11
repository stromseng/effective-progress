import { createDescriptionColumn } from "./columns/description-column";
import { createElapsedColumn } from "./columns/elapsed-column";
import { createEtaColumn } from "./columns/eta-column";
import { createProgressColumn } from "./columns/progress-column";

export const defaultRendererv2Columns = [
  createDescriptionColumn(),
  createProgressColumn(),
  createElapsedColumn(),
  createEtaColumn(),
];
