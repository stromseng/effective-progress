import { createContext, useContext, type ReactNode } from "react";
import type { TaskRowModel } from "./store/types";

interface RenderFrameValue {
  readonly rows: ReadonlyArray<TaskRowModel>;
}

const RenderFrameContext = createContext<RenderFrameValue | undefined>(undefined);

interface RenderFrameProviderProps {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly children: ReactNode;
}

export const RenderFrameProvider = ({ rows, children }: RenderFrameProviderProps) => (
  <RenderFrameContext.Provider value={{ rows }}>{children}</RenderFrameContext.Provider>
);

export const useRenderFrame = (): RenderFrameValue => {
  const value = useContext(RenderFrameContext);
  if (value === undefined) {
    throw new Error("useRenderFrame must be used within a RenderFrameProvider.");
  }

  return value;
};
