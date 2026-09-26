import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "strip-shebang",
      transform(code) {
        // CLI scripts start with a shebang. Vitest's transform leaves it in
        // the module body, which is a SyntaxError. The line is not code.
        if (code.charCodeAt(0) === 35 && code.charCodeAt(1) === 33) {
          const nl = code.indexOf("\n");
          return { code: nl >= 0 ? code.slice(nl + 1) : code, map: null };
        }
        return null;
      },
    },
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["opensrc/**", "node_modules/**"],
  },
});
