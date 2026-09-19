import cliSpinners from "cli-spinners";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";

const normalizeIntervalMillis = (intervalMillis: number): number => Math.max(1, intervalMillis);

const getSpinnerTickAtTime = (
  baseTick: number,
  startedAt: number,
  now: number,
  intervalMillis: number,
): number => {
  const elapsedMillis = Math.max(0, now - startedAt);
  const elapsedFrames = Math.floor(elapsedMillis / normalizeIntervalMillis(intervalMillis));
  return baseTick + elapsedFrames;
};

const useSpinnerClock = (active: boolean, intervalMillis: number): number => {
  const [tick, setTick] = useState(0);
  const tickRef = useRef(tick);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const baseTick = tickRef.current;
    const startedAt = Date.now();
    const updateTick = () => {
      setTick(getSpinnerTickAtTime(baseTick, startedAt, Date.now(), intervalMillis));
    };

    updateTick();
    const interval = setInterval(() => {
      updateTick();
    }, normalizeIntervalMillis(intervalMillis));

    return () => {
      clearInterval(interval);
    };
  }, [active, intervalMillis]);

  return tick;
};

const DEFAULT_SPINNER_INTERVAL_MILLIS = cliSpinners.dots.interval;

const SpinnerContext = createContext(0);

interface SpinnerClockProviderProps {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly intervalMillis?: number;
  readonly tickOverride?: number;
}

export const SpinnerClockProvider = ({
  active,
  children,
  intervalMillis = DEFAULT_SPINNER_INTERVAL_MILLIS,
  tickOverride,
}: SpinnerClockProviderProps) => {
  const liveTick = useSpinnerClock(active, intervalMillis);
  const tick = tickOverride ?? liveTick;
  return <SpinnerContext.Provider value={tick}>{children}</SpinnerContext.Provider>;
};

/** Subscribe to the shared spinner clock. Disabled cells return 0 without subscribing. */
export const useSpinnerTick = (active = true): number => (active ? use(SpinnerContext) : 0);
