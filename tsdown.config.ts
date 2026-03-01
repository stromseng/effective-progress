import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts"],
  platform: "node",
  format: ["esm"],
  dts: true,
  clean: true,
});
