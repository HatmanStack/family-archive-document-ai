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
}, {
  // Backend API guardrails (ADR-0001, ADR-0003, ADR-0004).
  // Inert today because eslint runs only inside frontend/, but enforced
  // immediately if backend linting is wired up in the future. They also
  // surface violations if any contributor copies these patterns into frontend
  // code under matching paths.
  files: [
    '**/backend/lambdas/api/src/routes/**/*.ts',
    '**/backend/lambdas/api/src/**/*.ts',
  ],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'TSAsExpression[typeAnnotation.typeName.name=\'Error\']',
        message: 'Do not cast to Error. Use toError() from lib/errors and check instanceof typed error classes.',
      },
      {
        selector: 'TSNonNullExpression > Identifier[name=\'userId\']',
        message: 'Do not use the non-null assertion on userId. Rely on requireAuth() middleware to guarantee presence.',
      },
      {
        selector: 'SwitchStatement[discriminant.object.name=\'event\'][discriminant.property.name=\'resource\']',
        message: 'Do not switch on event.resource inside route handlers. Use the declarative Router from lib/router.ts.',
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@aws-sdk/s3-request-presigner',
            importNames: ['getSignedUrl'],
            message: 'Import getSignedUrl only from lib/s3-presign.ts. Routes must not call the presigner directly.',
          },
        ],
      },
    ],
  },
})
