import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme';

const WEEKDAY_LABEL = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildStrip(centerIso: string) {
  const center = new Date(centerIso + 'T00:00:00.000Z');
  const days: Date[] = [];
  // -3..3 (7 ô, lẻ) để ngày đang chọn luôn nằm đúng giữa dải — xem daily-log.tsx.
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(center);
    d.setUTCDate(d.getUTCDate() + offset);
    days.push(d);
  }
  return days;
}

/** Dải 7 ngày dùng chung giữa tab Tiến độ (preview gọn) và Nhật ký ngày (đầy đủ) — tách ra đây để
 * tránh lặp lại logic buildStrip/isoDay ở 2 nơi. */
export function DayStrip({
  selectedDate,
  onSelect,
}: {
  selectedDate: string;
  onSelect: (iso: string) => void;
}) {
  const strip = buildStrip(selectedDate);
  const todayIso = isoDay(new Date());

  // Kiểu mockup 12/16/20: chữ thứ đậm + số ngày nhỏ, ngày đang chọn mờ đi, không ô viền; gạch đáy ngăn với nội dung.
  return (
    <View style={styles.stripRow}>
      {strip.map((d) => {
        const iso = isoDay(d);
        const selected = iso === selectedDate;
        const isToday = iso === todayIso;
        return (
          <TouchableOpacity key={iso} style={styles.dayCell} onPress={() => onSelect(iso)}>
            <Text style={[styles.dayLabel, selected && styles.dimmed, !selected && isToday && styles.today]}>
              {WEEKDAY_LABEL[d.getUTCDay()]}
            </Text>
            <Text style={[styles.dayNumber, selected && styles.dimmed]}>{String(d.getUTCDate()).padStart(2, '0')}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stripRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    paddingBottom: 10,
  },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dayLabel: { fontSize: 14, fontWeight: '800', color: colors.text },
  dayNumber: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dimmed: { color: '#B0B0B0', fontWeight: '600' },
  today: { color: colors.primary },
});
