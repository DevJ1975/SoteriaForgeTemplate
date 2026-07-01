/**
 * Babel config for the Expo custom dev client.
 *
 * - `babel-preset-expo` covers React Native + expo-router.
 * - The WatermelonDB decorator plugins are required because the offline models
 *   (owned by the offline agent, under src/db/**) use `@field` / `@relation`
 *   style decorators. They are listed here so those files compile as soon as
 *   they land — this file is shared infra, not part of the offline subtree.
 * - `react-native-reanimated/plugin` MUST be listed LAST.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      'react-native-reanimated/plugin',
    ],
  };
};
