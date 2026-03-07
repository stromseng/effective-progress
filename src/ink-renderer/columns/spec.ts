import stringWidth from "string-width";
import type { ReactNode } from "react";
import type { ResolvedColumn } from "./planner";

export interface ColumnVariantSpec<Row> {
  readonly id: string;
  readonly minWidth: number;
  readonly idealWidth: number;
  readonly maxWidth?: number;
  readonly renderCell: (row: Row, width: number) => ReactNode;
}

export interface ColumnSpec<Row> {
  readonly id: string;
  readonly grow: number;
  readonly canHide: boolean;
  readonly variants: ReadonlyArray<ColumnVariantSpec<Row>>;
}

export interface VariantResistanceResolver {
  readonly shrink: (columnId: string, variantId: string) => number;
  readonly demote: (columnId: string, variantId: string) => number;
  readonly hide: (columnId: string, variantId: string) => number;
}

export const textWidth = (text: string): number => stringWidth(text);

export const resolveColumnSpec = <Row>(
  spec: ColumnSpec<Row>,
  resistance: VariantResistanceResolver,
): ResolvedColumn<Row> => ({
  id: spec.id,
  grow: spec.grow,
  canHide: spec.canHide,
  variants: spec.variants.map((variant) => ({
    id: variant.id,
    minWidth: variant.minWidth,
    idealWidth: variant.idealWidth,
    maxWidth: variant.maxWidth,
    shrinkResistance: resistance.shrink(spec.id, variant.id),
    demoteResistance: resistance.demote(spec.id, variant.id),
    hideResistance: resistance.hide(spec.id, variant.id),
    renderCell: variant.renderCell,
  })),
});

export const resolveColumnSpecs = <Row>(
  specs: ReadonlyArray<ColumnSpec<Row>>,
  resistance: VariantResistanceResolver,
): Array<ResolvedColumn<Row>> =>
  specs.flatMap((spec) => (spec.variants.length > 0 ? [resolveColumnSpec(spec, resistance)] : []));
