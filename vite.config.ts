import tsdownConfig from './tsdown.config.ts';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: tsdownConfig,
  lint: {
    ignorePatterns: ['dist/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ['dist/**'],
    semi: true,
    singleQuote: true,
  },
});
