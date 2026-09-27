import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Fixtures are synthetic and test-only (PRD §9.1, App. D.7).
const fixturePatterns = [
  {
    group: ["@/data/fixtures/**", "**/data/fixtures/**"],
    message: "data/fixtures is synthetic and test-only: import it from *.test.ts only (PRD §9.1).",
  },
];

// lib/contract and lib/graph are pure TypeScript with no framework or I/O (PRD §13.2, App. B.2).
const purityPaths = [
  { name: "react", message: "lib/contract and lib/graph are pure TypeScript: no React (PRD §13.2)." },
  { name: "node:fs", message: "lib/contract and lib/graph must not touch the filesystem: read files in scripts or lib/server (PRD §13.2)." },
];
const purityPatterns = [
  { group: ["next", "next/*"], message: "lib/contract and lib/graph are pure TypeScript: no Next.js (PRD §13.2)." },
  { group: ["@/components/*"], message: "lib/contract and lib/graph must not import UI components (PRD §13.2)." },
  { group: ["@/lib/server/*"], message: "lib/contract and lib/graph must not import server-only code (PRD §13.2)." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
    },
  },
  // Broad rule first: a later block REPLACES no-restricted-imports rather than merging into it,
  // so the narrower block below repeats these patterns.
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: fixturePatterns }],
    },
  },
  {
    files: ["lib/contract/**/*.ts", "lib/graph/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: purityPaths, patterns: [...purityPatterns, ...fixturePatterns] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client (App. A.2).
    "lib/server/db/generated/**",
  ]),
]);

export default eslintConfig;
