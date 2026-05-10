import cliSpinners from "cli-spinners";
import { createContext, use, type ReactNode } from "react";
import { useSpinnerClock } from "../hooks/use-spinner-clock";

const DEFAULT_SPINNER_INTERVAL_MILLIS = cliSpinners.dots.interval;

const SpinnerContext = createContext(0);

interface SpinnerProviderProps {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly intervalMillis?: number;
  readonly tickOverride?: number;
}

export const SpinnerProvider = ({
  active,
  children,
  intervalMillis = DEFAULT_SPINNER_INTERVAL_MILLIS,
  tickOverride,
}: SpinnerProviderProps) => {
  const liveTick = useSpinnerClock(active, intervalMillis);
  const tick = tickOverride ?? liveTick;
  return <SpinnerContext.Provider value={tick}>{children}</SpinnerContext.Provider>;
};

export const useSpinnerTick = (): number => use(SpinnerContext);
