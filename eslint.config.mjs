import globals from 'globals';
import mochaPlugin from 'eslint-plugin-mocha';

export default [
    mochaPlugin.configs.flat.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'mocha/no-mocha-arrows': 'off',
            'mocha/max-top-level-suites': 'off',
            'mocha/no-setup-in-describe': 'off',
            'prefer-const': 'warn',
            'no-var': 'warn',
            'no-undef': ['error', {
                typeof: true,
            }],
            'no-dupe-args': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-extra-parens': 'warn',
            'no-unreachable': 'error',
            'no-unexpected-multiline': 'warn',
            'valid-typeof': 'error',
            curly: ['warn', 'multi'],
            'no-alert': 'error',
            'no-else-return': 'error',
            'no-eval': 'warn',
            'no-implicit-coercion': 'error',
            'no-implied-eval': 'error',
            'no-iterator': 'error',
            'no-loop-func': 'error',
            'no-multi-str': 'error',
            'no-proto': 'error',
            'no-redeclare': 'error',
            'no-self-assign': 'error',
            'no-self-compare': 'error',
            'no-useless-return': 'error',
            'no-void': 'error',
            'no-with': 'error',
            'require-await': 'error',
            'no-unused-vars': 'warn',
            'no-use-before-define': ['error', {
                functions: false,
            }],
            'block-spacing': ['warn', 'always'],
            'brace-style': ['warn', 'stroustrup', {
                allowSingleLine: true,
            }],
            camelcase: 'error',
            'comma-spacing': 'error',
            'comma-style': 'error',
            'func-call-spacing': 'error',
            indent: ['error', 4, {
                SwitchCase: 1,
            }],
            'key-spacing': 'error',
            'keyword-spacing': ['warn', {
                before: true,
                after: false,
                overrides: {
                    case: {
                        after: true,
                    },
                    default: {
                        after: true,
                    },
                    from: {
                        after: true,
                    },
                    return: {
                        after: true,
                    },
                    throw: {
                        after: true,
                    },
                    var: {
                        after: true,
                    },
                    const: {
                        after: true,
                    },
                    let: {
                        after: true,
                    },
                },
            }],
            'line-comment-position': 'error',
            'max-params': ['error', 4],
            'no-tabs': 'error',
            quotes: ['warn', 'single'],
            'linebreak-style': ['error', 'windows'],
            'complexity': ['warn', 5]
        },
    }
];