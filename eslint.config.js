import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dev-dist/**',
      'node_modules/**',
      '.npm-cache/**',
      'coverage/**',
      'public/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022
      }
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    }
  },
  {
    rules: {
      // 页面/组件使用文件名作为组件名（Home.vue、Training.vue 等）
      'vue/multi-word-component-names': 'off',
      // 允许以下划线开头的未使用参数（回调签名占位）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      // Vue 3 组合式 API 中允许单文件多组件命名风格
      'vue/require-default-prop': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/attributes-order': 'off'
    }
  },
  {
    files: ['tests/**/*.ts', 'vite.config.ts', 'eslint.config.js'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // 测试里用 h() 定义桩组件，一个文件出现多个组件是正常的
      'vue/one-component-per-file': 'off'
    }
  },
  {
    // 开发/测试脚本运行在 Node 环境
    files: ['.tools/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-useless-assignment': 'off'
    }
  }
)
