import { defineVideo } from "termcut";

export default defineVideo(
  {
    output: "docs/images/basic.gif",
    theme: "Snazzy",
    width: 1200,
    height: 300,
    font: { size: 18 },
    fps: 30,
    shell: "zsh",
    waitTimeout: "60s",
    cache: false,
    requires: ["bun"],
  },
  async (t) => {
    await t.sleep("1s");
    await t.run("bun run examples/basic.ts");
    await t.sleep("3s");
  },
);
