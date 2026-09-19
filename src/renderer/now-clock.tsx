import { createContext, type ReactNode, use, useEffect, useReducer } from "react";

const useNowClock = (active: boolean, intervalMillis: number): number => {
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

const NOW_INTERVAL_MILLIS = 1_000;

const NowContext = createContext(Date.now());

interface NowClockProviderProps {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly nowOverride?: number;
}

export const NowClockProvider = ({ active, children, nowOverride }: NowClockProviderProps) => {
  const liveNow = useNowClock(active, NOW_INTERVAL_MILLIS);
  const now = nowOverride ?? liveNow;
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
};

/** Subscribe to the shared one-second clock. Disabled cells return 0 without subscribing. */
export const useNow = (active = true): number => (active ? use(NowContext) : 0);
