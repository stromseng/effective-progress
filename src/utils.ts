export const inferTotal = (iterable: Iterable<unknown>): number | undefined => {
  if (Array.isArray(iterable)) {
    return iterable.length;
  }

  if (typeof iterable === "string") {
    return iterable.length;
  }

  const candidate = iterable as { length?: unknown; size?: unknown };
  if (typeof candidate.length === "number") {
    return candidate.length;
  }

  if (typeof candidate.size === "number") {
    return candidate.size;
  }

  return undefined;
};
