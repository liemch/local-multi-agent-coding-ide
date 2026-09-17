import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Monaco is vendored into public/ by scripts/setup-monaco.mjs at install
    // time. It is third-party minified output, not our source.
    "public/monaco/**",
  ]),
  {
    files: ["src/**/*.tsx"],
    rules: {
      /**
       * The panels fetch their data on mount with `void load()`, where `load`
       * is an async callback. Every setState inside it runs *after* an await,
       * so there is no synchronous cascading render — but the rule cannot see
       * through the async boundary and reports it anyway. Downgraded to a
       * warning so a genuine synchronous setState-in-effect still shows up.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
