// tsc compiles convex/*.ts into dist/ but does not copy the plain-JS
// convex/_generated assets the compiled hub imports at runtime.
import { cpSync } from "node:fs";

cpSync("convex/_generated", "dist/convex/_generated", { recursive: true });
console.log("postbuild: copied convex/_generated → dist/convex/_generated");
