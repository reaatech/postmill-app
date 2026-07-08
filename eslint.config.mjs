import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// ESLint 9 flat config. eslint-config-next 16 ships native flat configs and
// peer-requires eslint >=9, so they are spread in directly (no FlatCompat).
const eslintConfig = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/build/**',
      '**/*.min.js',
      // Generated reports and vendored/CommonJS build scripts — not app source.
      'e2e/playwright-report/**',
      'apps/frontend/public/**',
      '**/*.cjs',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Repo root is not the Next.js app (App Router lives in apps/frontend),
      // so this rule only emits a spurious "Pages directory cannot be found" notice.
      '@next/next/no-html-link-for-pages': 'off',
      'react/no-unescaped-entities': 'off',
      // The following rules are globally disabled because the existing codebase
      // has a large volume of occurrences and fixing them safely is tracked
      // debt. They should be re-enabled incrementally per-area rather than in
      // one giant PR. See remediation runbooks L-01..L-08 and T-13.
      '@typescript-eslint/no-explicit-any': 'off',                 // ~1,200 occurrences across backend/frontend
      '@typescript-eslint/no-unused-vars': 'off',                  // ~400 occurrences (many intentional destructuring)
      'react/display-name': 'off',                                 // ~80 anonymous component exports
      '@typescript-eslint/ban-ts-comment': 'off',                  // ~120 ts-ignore/ts-expect-error comments
      '@typescript-eslint/no-empty-object-type': 'off',            // ~60 empty interfaces used as extension points
      '@typescript-eslint/prefer-as-const': 'error',               // ~40 literal type vs const assertions
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off', // ~30 occurrences
      // React Compiler rule: 108 occurrences across 42 frontend files. Each fix
      // requires careful dependency review to avoid breaking memoization semantics.
      // Tracked debt (L-02 / F-07); downgrade to warn so CI stays green while the
      // debt remains visible.
      'react-hooks/preserve-manual-memoization': 'warn',           // ~108 occurrences across 42 files
    },
  },
  {
    // Accessibility rules for the Next.js frontend. eslint-config-next already
    // registers the jsx-a11y plugin, so only its recommended ruleset is turned
    // on here (scoped to the frontend source).
    files: ['apps/frontend/src/**/*.{js,jsx,ts,tsx}'],
    rules: {
      ...jsxA11y.configs.recommended.rules,
      // High-volume rules that can't be safely auto-fixed are tracked as
      // warnings (visible, non-blocking) instead of being silently disabled:
      //   - the click-on-<div> pattern is pervasive and each fix needs a real
      //     keyboard handler / element change (tracked debt);
      //   - <video>/<audio> show user-generated media for which no caption
      //     track exists;
      //   - autoFocus is used intentionally on a handful of modals/inputs;
      //   - most flagged <label>s sit beside custom widgets (role="switch"
      //     buttons, comboboxes, button grids) with no labelable form control,
      //     so a correct fix is per-case (aria-labelledby) rather than auto.
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/media-has-caption': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      // The Designer canvas + video timeline are keyboard-interactive editor
      // surfaces (a focusable container with key handlers); jsx-a11y 6.7.1 has
      // no accepted role for that shape, so these two are tracked as warnings.
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': 'warn',
    },
  },
];

export default eslintConfig;
