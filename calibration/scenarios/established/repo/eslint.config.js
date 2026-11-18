import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.strictTypeChecked, {
  languageOptions: { parserOptions: { projectService: true } },
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
    "@eslint-community/eslint-comments/require-description": "error",
  },
});
