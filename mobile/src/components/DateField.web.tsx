import { createElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Bản web của DateField — dùng <input type="date"> sẵn của trình duyệt. */
export function DateField({
  value,
  onChange,
  minimumDate,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  placeholder: string;
  minimumDate?: Date;
}) {
  return (
    <View style={styles.field}>
      <Text>📅</Text>
      {createElement('input', {
        type: 'date',
        value: value ? ymd(value) : '',
        min: minimumDate ? ymd(minimumDate) : undefined,
        onChange: (e: { target: { value: string } }) => {
          const [y, m, d] = e.target.value.split('-').map(Number);
          if (y) onChange(new Date(y, m - 1, d));
        },
        style: { flex: 1, border: 'none', outline: 'none', fontSize: 15, color: colors.text, background: 'transparent' },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
});
