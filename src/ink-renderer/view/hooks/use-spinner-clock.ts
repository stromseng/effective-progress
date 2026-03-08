import { useEffect, useState } from "react";

export const useSpinnerClock = (active: boolean, intervalMillis: number): number => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const interval = setInterval(() => {
      setTick((current) => current + 1);
    }, intervalMillis);

    return () => {
      clearInterval(interval);
    };
  }, [active, intervalMillis]);

  return tick;
};
