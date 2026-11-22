import type { TextStyle } from 'react-native';
import { Text } from 'react-native';

/** Render markdown NHẸ cho text do AI sinh ra — chỉ xử lý **in đậm**, giữ nguyên xuống dòng. Không
 * dùng thư viện ngoài vì AI (xem AiService, backend) chỉ thật sự dùng mỗi cú pháp này, không có
 * heading/link/code block — tự viết nhỏ gọn hơn kéo thêm dependency chỉ để render 1 kiểu style. */
function renderInlineBold(line: string, keyPrefix: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Text key={`${keyPrefix}-${i}`} style={{ fontWeight: '700' }}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      <Text key={`${keyPrefix}-${i}`}>{part}</Text>
    ),
  );
}

export function MarkdownText({ text, style }: { text: string; style?: TextStyle | TextStyle[] }) {
  const lines = text.split('\n');
  return (
    <Text style={style}>
      {lines.map((line, i) => (
        <Text key={i}>
          {renderInlineBold(line, String(i))}
          {i < lines.length - 1 ? '\n' : ''}
        </Text>
      ))}
    </Text>
  );
}
