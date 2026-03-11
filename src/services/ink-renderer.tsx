import { Context, Layer } from "effect";
import { defaultRendererv2Columns } from "../rendererv2/default-columns";
import { makeRendererv2InkRendererService } from "../rendererv2/renderer-service";
import type { ProgressRenderStore } from "../rendererv2/store";
import type { ProgressStdioService } from "./stdio";

interface InkRendererService {
  readonly run: (
    store: ProgressRenderStore,
    stdio: ProgressStdioService,
    isTTY: boolean,
  ) => import("effect").Effect.Effect<void>;
}

export class InkRenderer extends Context.Tag("stromseng.dev/effective-progress/InkRenderer")<
  InkRenderer,
  InkRendererService
>() {
  static readonly Default = Layer.succeed(
    InkRenderer,
    InkRenderer.of(makeRendererv2InkRendererService(defaultRendererv2Columns)),
  );
}
