import stringWidth from "fast-string-width";

const WIDTH_CACHE_LIMIT = 4_096;
const widthCache = new Map<string, number>();

export const textWidth = (text: string): number => {
  const cached = widthCache.get(text);
  if (cached !== undefined) {
    return cached;
  }

  const width = stringWidth(text);
  if (widthCache.size >= WIDTH_CACHE_LIMIT) {
    widthCache.clear();
  }
  widthCache.set(text, width);
  return width;
};
