module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Phải luôn là plugin cuối cùng trong danh sách (yêu cầu của react-native-worklets, kế thừa từ reanimated/plugin cũ).
    plugins: ['react-native-worklets/plugin'],
  };
};
