import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme';

const fmt = (d: Date) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Ô ngày "📅 01/10/2026" (mockup 04, 18) — bấm để mở lịch chọn ngày native. Android hiện hộp
 * thoại lịch sẵn; iOS hiện lịch inline trong sheet có nút Xong.
 */
export function DateField({
  value,
  onChange,
  placeholder,
  minimumDate,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  placeholder: string;
  minimumDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? new Date());

  return (
    <>
      <TouchableOpacity
        style={styles.field}
        onPress={() => {
          setDraft(value ?? minimumDate ?? new Date());
          setOpen(true);
        }}
      >
        <Text>📅</Text>
        <Text style={[styles.text, !value && styles.placeholder]}>{value ? fmt(value) : placeholder}</Text>
      </TouchableOpacity>

      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={draft}
          mode="date"
          minimumDate={minimumDate}
          onChange={(e, d) => {
            setOpen(false);
            if (e.type === 'set' && d) onChange(d);
          }}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.cancel}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                <Text style={styles.done}>Xong</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              locale="vi-VN"
              minimumDate={minimumDate}
              themeVariant="light"
              accentColor={colors.primary}
              onChange={(_, d) => d && setDraft(d)}
            />
          </View>
        </Modal>
      )}
    </>
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
  text: { fontSize: 15, color: colors.text },
  placeholder: { color: '#9CA3AF' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 30 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  cancel: { fontSize: 15, color: colors.textMuted },
  done: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
