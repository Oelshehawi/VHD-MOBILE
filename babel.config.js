module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Fix Hermes "too many nested expressions" error
      // Prevents Babel from creating chained assignment expressions
      ['@babel/plugin-transform-modules-commonjs', { loose: true }],
      // Reanimated plugin MUST be last!
      // Note: Reanimated 4.x includes worklets plugin internally
      'react-native-reanimated/plugin',
    ],
  };
};
