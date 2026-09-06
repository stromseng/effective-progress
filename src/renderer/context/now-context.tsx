import { createContext, use, type ReactNode } from "react";
import { useNowClock } from "../hooks/use-now-clock";

const NOW_INTERVAL_MILLIS = 1_000;

const NowContext = createContext(Date.now());

interface NowProviderProps {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly nowOverride?: number;
}

export const NowProvider = ({ active, children, nowOverride }: NowProviderProps) => {
  const liveNow = useNowClock(active, NOW_INTERVAL_MILLIS);
  const now = nowOverride ?? liveNow;
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
};

/** Subscribe to the shared one-second clock. Disabled cells return 0 without subscribing. */
export const useNow = (active = true): number => (active ? use(NowContext) : 0);
