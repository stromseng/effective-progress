import { useEffect, useState } from "react";

export const useNowClock = (active: boolean, intervalMillis: number): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }

    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, intervalMillis);

    return () => {
      clearInterval(interval);
    };
  }, [active, intervalMillis]);

  return now;
};
