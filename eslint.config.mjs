import ESLint from '@eslint/js';
import Stylistic from '@stylistic/eslint-plugin';
import TsESLint from 'typescript-eslint';

export default [
  ESLint.configs.recommended,
  Stylistic.configs['disable-legacy'],
  ...TsESLint.configs.strictTypeChecked,
  ...TsESLint.configs.stylisticTypeChecked,
  {
    files: [
      "**/*.ts"
    ],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigDirName: import.meta.dirname,
      },
    },
    plugins: {
      "@stylistic/ts": Stylistic
    },
    rules: {
      "@stylistic/ts/semi": [2, "always"],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
        }
      ]
    }
  }
];
