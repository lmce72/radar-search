import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

export default [
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {parser: tseslint.parser, parserOptions: {projectService: true, tsconfigRootDir: import.meta.dirname}},
    rules: {
      'obsidianmd/no-static-styles-assignment': 'error',
      'obsidianmd/no-unsupported-api': 'error',
      'obsidianmd/detach-leaves': 'error'
    }
  }
];
