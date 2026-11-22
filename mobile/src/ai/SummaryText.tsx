import { Text } from 'react-native';
import { colors } from '@/theme';

/**
 * Hiển thị tổng kết 8 PM (mockup 11): dòng "**Tiêu đề:** nội dung" in đậm phần tiêu đề, dòng thuộc
 * "Vấn đề phát sinh" tô đỏ. Văn bản cũ (đoạn văn thường) vẫn hiện bình thường.
 */
export function SummaryText({ body, numberOfLines }: { body: string; numberOfLines?: number }) {
  let inIssues = false;
  const lines = body.split('\n').filter((l) => l.trim());
  return (
    <Text style={{ fontSize: 12, lineHeight: 19, color: colors.text }} numberOfLines={numberOfLines}>
      {lines.map((line, i) => {
        const m = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
        if (m) inIssues = m[1].startsWith('Vấn đề');
        const isIssue = inIssues && !m && !/không có/i.test(line);
        return (
          <Text key={i}>
            {i > 0 ? '\n' : ''}
            {m ? (
              <>
                <Text style={{ fontWeight: '800' }}>{m[1]}</Text>
                {m[2] ? ` ${m[2]}` : ''}
              </>
            ) : (
              <Text style={isIssue ? { color: colors.danger } : undefined}>{line.replace(/\*\*/g, '')}</Text>
            )}
          </Text>
        );
      })}
    </Text>
  );
}
