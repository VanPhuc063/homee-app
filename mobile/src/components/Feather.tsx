import { Text, type TextProps } from 'react-native';
import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json';

/**
 * Thay thế trực tiếp cho `Feather` của `@expo/vector-icons`. Bản gốc tự chặn render, chờ
 * `Font.loadAsync()` xong mới vẽ icon — nhưng lệnh đó bị treo vô thời hạn trên Android (SDK 53 +
 * dev client, không rõ nguyên nhân sâu, đã thử tắt New Architecture cũng không hết). Font
 * `Feather.ttf` đã được nhúng tĩnh vào native app qua plugin "expo-font" trong app.json (xác
 * nhận hoạt động: test trực tiếp `fontFamily: 'Feather'` render đúng glyph), nên chỉ cần dùng
 * thẳng style `fontFamily` là đủ — không cần chờ load gì cả.
 */
const FEATHER_GLYPHS = glyphMap as Record<string, number>;

export function Feather({
  name,
  size = 24,
  color = '#000',
  style,
  ...rest
}: {
  name: keyof typeof glyphMap;
  size?: number;
  color?: string;
} & Omit<TextProps, 'children'>) {
  const code = FEATHER_GLYPHS[name];
  return (
    <Text style={[{ fontFamily: 'Feather', fontSize: size, color }, style]} {...rest}>
      {code ? String.fromCodePoint(code) : ''}
    </Text>
  );
}

Feather.glyphMap = glyphMap;
