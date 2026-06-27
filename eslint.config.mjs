import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  {
    // Generated / build output.
    ignores: ["dist", "build", "coverage", "src/schema.json"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "unused-imports": unusedImports,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // New JSX transform — no need to import React in scope.
      "react/react-in-jsx-scope": "off",
      // TypeScript handles prop validation.
      "react/prop-types": "off",
      // The Google API integration is loosely typed; allow `any` there.
      "@typescript-eslint/no-explicit-any": "off",
      // exhaustive-deps flags several intentional/legacy patterns here; fixing
      // them is a behavioral change best handled alongside feature work.
      "react-hooks/exhaustive-deps": "off",
      // Auto-removable unused imports; report other unused vars (underscore to ignore).
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  // The WAMP sidecar server is plain Node ESM.
  {
    files: ["server/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Dev scripts run in Node but also inject browser-context callbacks (Playwright).
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Test files.
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
