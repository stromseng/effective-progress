import { useEffect, useMemo, useRef } from "react";

export const useStickyWidth = (preferredWidth: number): number => {
  const stickyWidthRef = useRef(preferredWidth);

  const stickyWidth = useMemo(
    () => Math.max(stickyWidthRef.current, preferredWidth),
    [preferredWidth],
  );

  useEffect(() => {
    stickyWidthRef.current = stickyWidth;
  }, [stickyWidth]);

  return stickyWidth;
};
