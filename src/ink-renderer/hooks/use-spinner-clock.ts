import { useEffect, useRef, useState } from "react";

const normalizeIntervalMillis = (intervalMillis: number): number => Math.max(1, intervalMillis);

export const getSpinnerTickAtTime = (
  baseTick: number,
  startedAt: number,
  now: number,
  intervalMillis: number,
): number => {
  const elapsedMillis = Math.max(0, now - startedAt);
  const elapsedFrames = Math.floor(elapsedMillis / normalizeIntervalMillis(intervalMillis));
  return baseTick + elapsedFrames;
};

export const useSpinnerClock = (active: boolean, intervalMillis: number): number => {
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
