import { createAmountColumn } from "./columns/amount-column";
import { createBarColumn } from "./columns/bar-column";
import { createDescriptionColumn } from "./columns/description-column";
import { createElapsedColumn } from "./columns/elapsed-column";
import { createEtaColumn } from "./columns/eta-column";

export const defaultRendererv2Columns = [
  createDescriptionColumn(),
  createBarColumn(),
  createAmountColumn(),
  createElapsedColumn(),
  createEtaColumn(),
];
