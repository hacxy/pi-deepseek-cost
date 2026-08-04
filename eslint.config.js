import { hacxy } from '@hacxy/eslint-config'

export default [
  ...hacxy({ node: true }),
  {
    // Test files use `!` liberally for index-access assertions; the strict
    // noUncheckedIndexedAccess config makes that noisy. Tests are exempt.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]
