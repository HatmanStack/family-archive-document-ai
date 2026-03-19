import antfu from '@antfu/eslint-config'

export default antfu({
  svelte: true,
  typescript: true,
  ignores: [
    'mdsvex.config.js',
    '**/*.md',
  ],
  overrides: {
    svelte: {
      'import/no-mutable-exports': 'off',
    },
  },
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-alert': 'off',
    'node/prefer-global/process': 'off',
    'node/prefer-global/buffer': 'off',
    'svelte/no-at-html-tags': 'off',
    'no-use-before-define': 'off',
    'unused-imports/no-unused-vars': 'error',
    'unused-imports/no-unused-imports': 'error',
    'no-unused-vars': 'error',
    'prefer-const': 'error',
    'svelte/indent': 'off',
    'style/indent-binary-ops': 'off',
    'regexp/no-super-linear-backtracking': 'off',
    'e18e/prefer-static-regex': 'off',
    'eqeqeq': 'error',
    'no-undef-init': 'off',
  },
})
