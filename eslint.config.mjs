import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Agent worktrees hold whole copies of the repo plus their own .next
      // output. They are untracked, so CI never saw them — but a local
      // `npm run lint:ratchet` counted them and reported a regression that
      // did not exist, which is exactly how a ratchet gets ignored.
      ".claude/**",
    ],
  },
];

export default eslintConfig;
