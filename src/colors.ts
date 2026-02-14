import chalk from "chalk";
import type { ChalkInstance } from "chalk";
import { Schema } from "effect";

export const StyleModifierSchema = Schema.Literal(
  "bold",
  "dim",
  "italic",
  "underline",
  "inverse",
  "hidden",
  "strikethrough",
);
export type StyleModifier = typeof StyleModifierSchema.Type;

export const NamedColorSchema = Schema.Literal(
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "blackBright",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright",
);
export type NamedColor = typeof NamedColorSchema.Type;

const HexColorSchema = Schema.String.pipe(Schema.pattern(/^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/));
const ColorChannelSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(255),
);
const Ansi256Schema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(255),
);
const ModifiersSchema = Schema.optional(Schema.Array(StyleModifierSchema));

export const NamedColorStyleSchema = Schema.Struct({
  kind: Schema.Literal("named"),
  value: NamedColorSchema,
  modifiers: ModifiersSchema,
});

export const HexColorStyleSchema = Schema.Struct({
  kind: Schema.Literal("hex"),
  value: HexColorSchema,
  modifiers: ModifiersSchema,
});

export const RgbColorStyleSchema = Schema.Struct({
  kind: Schema.Literal("rgb"),
  value: Schema.Struct({
    r: ColorChannelSchema,
    g: ColorChannelSchema,
    b: ColorChannelSchema,
  }),
  modifiers: ModifiersSchema,
});

export const Ansi256ColorStyleSchema = Schema.Struct({
  kind: Schema.Literal("ansi256"),
  value: Ansi256Schema,
  modifiers: ModifiersSchema,
});

export const ColorStyleSchema = Schema.Union(
  NamedColorStyleSchema,
  HexColorStyleSchema,
  RgbColorStyleSchema,
  Ansi256ColorStyleSchema,
);
export type ColorStyle = typeof ColorStyleSchema.Type;

export const ProgressBarColorsSchema = Schema.Struct({
  fill: ColorStyleSchema,
  empty: ColorStyleSchema,
  brackets: ColorStyleSchema,
  percent: ColorStyleSchema,
  spinner: ColorStyleSchema,
  done: ColorStyleSchema,
  failed: ColorStyleSchema,
});
export type ProgressBarColors = typeof ProgressBarColorsSchema.Type;

export const defaultProgressBarColors: ProgressBarColors = {
  fill: { kind: "named", value: "cyan" },
  empty: { kind: "named", value: "white", modifiers: ["dim"] },
  brackets: { kind: "named", value: "white", modifiers: ["dim"] },
  percent: { kind: "named", value: "white", modifiers: ["bold"] },
  spinner: { kind: "named", value: "yellow" },
  done: { kind: "named", value: "green" },
  failed: { kind: "named", value: "red" },
};

const applyModifier = (instance: ChalkInstance, modifier: StyleModifier): ChalkInstance => {
  switch (modifier) {
    case "bold":
      return instance.bold;
    case "dim":
      return instance.dim;
    case "italic":
      return instance.italic;
    case "underline":
      return instance.underline;
    case "inverse":
      return instance.inverse;
    case "hidden":
      return instance.hidden;
    case "strikethrough":
      return instance.strikethrough;
  }
};

const applyNamedColor = (instance: ChalkInstance, color: NamedColor): ChalkInstance => {
  switch (color) {
    case "black":
      return instance.black;
    case "red":
      return instance.red;
    case "green":
      return instance.green;
    case "yellow":
      return instance.yellow;
    case "blue":
      return instance.blue;
    case "magenta":
      return instance.magenta;
    case "cyan":
      return instance.cyan;
    case "white":
      return instance.white;
    case "blackBright":
      return instance.blackBright;
    case "redBright":
      return instance.redBright;
    case "greenBright":
      return instance.greenBright;
    case "yellowBright":
      return instance.yellowBright;
    case "blueBright":
      return instance.blueBright;
    case "magentaBright":
      return instance.magentaBright;
    case "cyanBright":
      return instance.cyanBright;
    case "whiteBright":
      return instance.whiteBright;
  }
};

const resolveBaseStyle = (style: ColorStyle): ChalkInstance => {
  switch (style.kind) {
    case "named":
      return applyNamedColor(chalk, style.value);
    case "hex":
      return chalk.hex(style.value);
    case "rgb":
      return chalk.rgb(style.value.r, style.value.g, style.value.b);
    case "ansi256":
      return chalk.ansi256(style.value);
  }
};

const applyModifiers = (instance: ChalkInstance, modifiers: ReadonlyArray<StyleModifier>) => {
  let styled = instance;
  for (const modifier of modifiers) {
    styled = applyModifier(styled, modifier);
  }
  return styled;
};

export const applyColorStyle = (style: ColorStyle, text: string): string => {
  const styled = applyModifiers(resolveBaseStyle(style), style.modifiers ?? []);
  return styled(text);
};

export interface CompiledProgressBarColors {
  readonly fill: (text: string) => string;
  readonly empty: (text: string) => string;
  readonly brackets: (text: string) => string;
  readonly percent: (text: string) => string;
  readonly spinner: (text: string) => string;
  readonly done: (text: string) => string;
  readonly failed: (text: string) => string;
}

export const compileProgressBarColors = (colors: ProgressBarColors): CompiledProgressBarColors => ({
  fill: (text) => applyColorStyle(colors.fill, text),
  empty: (text) => applyColorStyle(colors.empty, text),
  brackets: (text) => applyColorStyle(colors.brackets, text),
  percent: (text) => applyColorStyle(colors.percent, text),
  spinner: (text) => applyColorStyle(colors.spinner, text),
  done: (text) => applyColorStyle(colors.done, text),
  failed: (text) => applyColorStyle(colors.failed, text),
});
