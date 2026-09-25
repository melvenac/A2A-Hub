import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig(({ command }) => ({
  plugins: [svelte()],
  // The build is served by the hub at /ui/ (src/ui.ts); the dev server stays at /.
  base: command === "build" ? "/ui/" : "/",
  server: {
    port: 5173, // clear of Convex :3210/:3211 and hub :4000
  },
}));
