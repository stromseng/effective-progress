import { useEffect, useReducer } from "react";

export const useNowClock = (active: boolean, intervalMillis: number): number => {
  const [now, updateNow] = useReducer(() => Date.now(), undefined, Date.now);

  useEffect(() => {
    if (!active) {
      return;
    }

    updateNow();
    const interval = setInterval(() => {
      updateNow();
    }, intervalMillis);

    return () => {
      clearInterval(interval);
    };
  }, [active, intervalMillis]);

  return now;
};
