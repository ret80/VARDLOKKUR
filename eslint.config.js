import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      ".playwright-mcp/**",
      "temp/**",
      "tasks/**",
      "scripts/**",
      "doc/**",
      "public/**",
      "*.cjs",
      "*.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Новые compiler-правила react-hooks: в этом коде дают ложные срабатывания
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // В проекте много легитимных пустых catch-блоков ("игнорируем") — это не ошибка
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // Стилистические/строгие правила, мешающие легитимным приёмам в этом коде
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-unused-expressions": ["warn", { allowShortCircuit: true, allowTernary: true }],
      "no-extra-boolean-cast": "warn",
      "no-useless-assignment": "warn",
      "prefer-const": "warn",
      "no-case-declarations": "warn",
      "no-fallthrough": "warn",
    },
  },
);
