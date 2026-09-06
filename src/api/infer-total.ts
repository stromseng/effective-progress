import { Predicate } from "effect";

export const inferTotal = (iterable: Iterable<unknown>): number | undefined => {
  if (Array.isArray(iterable)) {
    return iterable.length;
  }

  if (Predicate.isString(iterable)) {
    // String iteration yields Unicode code points, not UTF-16 code units.
    return [...iterable].length;
  }

  if (Predicate.hasProperty(iterable, "length") && Predicate.isNumber(iterable.length)) {
    return iterable.length;
  }

  if (Predicate.hasProperty(iterable, "size") && Predicate.isNumber(iterable.size)) {
    return iterable.size;
  }

  return undefined;
};
