// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Generated files and Deno Edge Functions (npm: specifiers resolve only under Deno).
    ignores: ['dist/*', '.expo/*', 'supabase/functions/*'],
  },
]);
