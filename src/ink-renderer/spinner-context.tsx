import { createContext, useContext, type ReactNode } from "react";
import { useSpinnerClock } from "./hooks/use-spinner-clock";

const SPINNER_INTERVAL_MILLIS = 100;

const SpinnerContext = createContext(0);

interface SpinnerProviderProps {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly tickOverride?: number;
}

export const SpinnerProvider = ({ active, children, tickOverride }: SpinnerProviderProps) => {
  const liveTick = useSpinnerClock(active, SPINNER_INTERVAL_MILLIS);
  const tick = tickOverride ?? liveTick;
  return <SpinnerContext.Provider value={tick}>{children}</SpinnerContext.Provider>;
};

export const useSpinnerTick = (): number => useContext(SpinnerContext);
