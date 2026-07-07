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
    ],
  },
  {
    // public/ assets referenced by a raw leading-slash src (e.g.
    // <Image src="/branch-logo.png" />) are NOT prefixed with Next's basePath,
    // so they 404 in ephemeral PR preview environments served under /pr-<N>/.
    // Force them through assetPath() from @/lib/asset (a no-op in prod).
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='src'] > Literal[value=/^\\u002f/]",
          message:
            "Reference public/ assets via assetPath(\"/...\") from @/lib/asset — a raw \"/foo.png\" src is not prefixed with basePath and 404s in preview environments (/pr-<N>/).",
        },
      ],
    },
  },
];

export default eslintConfig;
