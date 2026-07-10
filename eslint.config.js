import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['src/pages/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': ['warn', {
        paths: [
          {
            name: 'firebase/firestore',
            message: 'Use services/repositories — pages must not call Firebase directly.',
          },
        ],
        patterns: [
          {
            group: ['**/services/firebase'],
            importNames: ['db', 'collection', 'getDocs', 'getDoc', 'onSnapshot', 'updateDoc', 'deleteDoc', 'addDoc', 'setDoc', 'writeBatch'],
            message: 'Use domain services/repositories from pages.',
          },
        ],
      }],
    },
  },
])
