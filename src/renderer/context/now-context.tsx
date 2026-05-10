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

export const useNow = (): number => use(NowContext);
