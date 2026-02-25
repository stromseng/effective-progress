import type { CellWrapMode } from "./types";

const ESC = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "g");
const RESET_ANSI = "\x1b[0m";

interface AnsiToken {
  readonly kind: "ansi" | "char";
  readonly value: string;
}

const textWidth = (text: string): number => Array.from(text).length;

export const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, "");

export const visibleWidth = (text: string): number => textWidth(stripAnsi(text));

const tokenizeAnsi = (text: string): ReadonlyArray<AnsiToken> => {
  const tokens: Array<AnsiToken> = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === "\x1b" && text[i + 1] === "[") {
      let j = i + 2;
      while (j < text.length) {
        const code = text.charCodeAt(j);
        j += 1;
        if (code >= 0x40 && code <= 0x7e) {
          break;
        }
      }
      tokens.push({ kind: "ansi", value: text.slice(i, j) });
      i = j;
      continue;
    }

    const codePoint = text.codePointAt(i);
    if (codePoint === undefined) {
      break;
    }

    const char = String.fromCodePoint(codePoint);
    tokens.push({ kind: "char", value: char });
    i += char.length;
  }

  return tokens;
};

const fitPlainText = (text: string, width: number, wrapMode: CellWrapMode): string => {
  const target = Math.max(0, Math.floor(width));
  if (target <= 0) {
    return "";
  }

  const chars = Array.from(text);
  let result = text;

  if (chars.length > target) {
    if (wrapMode === "ellipsis") {
      result = target === 1 ? "…" : `${chars.slice(0, target - 1).join("")}…`;
    } else {
      result = chars.slice(0, target).join("");
    }
  }

  const currentWidth = textWidth(result);
  if (currentWidth < target) {
    result += " ".repeat(target - currentWidth);
  }

  return result;
};

const fitAnsiText = (text: string, width: number, wrapMode: CellWrapMode): string => {
  const target = Math.max(0, Math.floor(width));
  if (target <= 0) {
    return "";
  }

  const tokens = tokenizeAnsi(text);
  const totalVisible = tokens.reduce((sum, token) => sum + (token.kind === "char" ? 1 : 0), 0);

  if (totalVisible <= target) {
    const padBy = target - totalVisible;
    return padBy > 0 ? `${text}${" ".repeat(padBy)}` : text;
  }

  const keepVisible = wrapMode === "ellipsis" ? Math.max(0, target - 1) : target;
  let visible = 0;
  let sawAnsi = false;
  let output = "";

  for (const token of tokens) {
    if (token.kind === "ansi") {
      sawAnsi = true;
      if (keepVisible > 0 && visible <= keepVisible) {
        output += token.value;
      }
      continue;
    }

    if (visible >= keepVisible) {
      break;
    }

    output += token.value;
    visible += 1;
  }

  if (wrapMode === "ellipsis" && target > 0) {
    output += "…";
  }

  if (sawAnsi && !output.endsWith(RESET_ANSI)) {
    output += RESET_ANSI;
  }

  const padBy = target - visibleWidth(output);
  if (padBy > 0) {
    output += " ".repeat(padBy);
  }

  return output;
};

export const fitRenderedText = (
  text: string,
  width: number,
  wrapMode: CellWrapMode,
  isTTY: boolean,
): string => {
  const raw = isTTY ? text : stripAnsi(text);
  if (!isTTY || raw.indexOf("\x1b[") === -1) {
    return fitPlainText(raw, width, wrapMode);
  }
  return fitAnsiText(raw, width, wrapMode);
};
