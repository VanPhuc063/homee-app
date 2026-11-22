import { useMutation } from '@tanstack/react-query';
import { AiGate } from '@/ai/AiLocked';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '@/api/client';
import { Feather } from '@/components/Feather';
import { LottieThinking } from '@/components/LottieThinking';
import { MarkdownText } from '@/components/MarkdownText';
import { colors } from '@/theme';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const STARTER_QUESTIONS = [
  'Bước chống thấm WC cần lưu ý gì?',
  'Tiến độ hiện tại có đang đúng kế hoạch không?',
  'Hạng mục nào sắp tới cần chuẩn bị vật tư gì?',
];

function AiChatInner() {
  const { projectId, initialQuestion } = useLocalSearchParams<{ projectId: string; initialQuestion?: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const heroInputRef = useRef<TextInput>(null);
  const bottomInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (initialQuestion) {
      setInput(initialQuestion);
      heroInputRef.current?.focus();
    }
  }, [initialQuestion]);

  const ask = useMutation({
    mutationFn: ({ question, history }: { question: string; history: ChatMessage[] }) =>
      api<{ answer: string }>(`/projects/${projectId}/ai/ask`, {
        method: 'POST',
        body: { question, history },
      }),
    onSuccess: (res) => {
      setMessages((prev) => [...prev, { role: 'assistant', text: res.answer }]);
    },
  });

  // Đưa câu hỏi lên conversation VÀ dọn ô input ngay lúc bấm gửi — không đợi API trả lời xong mới
  // hiện, tránh cảm giác "bấm không ăn" trong lúc AI đang xử lý.
  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || ask.isPending) return;
    const historyForRequest = messages;
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    ask.mutate({ question: q, history: historyForRequest });
  };

  const hasMessages = messages.length > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {!hasMessages ? (
        // Chưa có hội thoại — giống ô hỏi của Claude: 1 khối input to, nổi bật, nằm giữa màn hình
        // thay vì thanh input mảnh dán đáy màn dễ bị bỏ sót lúc mới vào.
        <ScrollView contentContainerStyle={styles.heroScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.heroIconCircle}>
            <Feather name="message-circle" size={30} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Hỏi AI tư vấn</Text>
          <Text style={styles.heroSubtitle}>
            Hỏi về tiến độ, quy trình kỹ thuật, hoặc cần giải thích 1 hạng mục đang thi công. AI
            không tự quyết định Đạt/Không đạt — mọi nghiệm thu vẫn do giám sát/chủ nhà quyết định.
          </Text>

          <View style={styles.heroInputBox}>
            <TextInput
              ref={heroInputRef}
              style={styles.heroInput}
              placeholder="Nhập câu hỏi của bạn…"
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[styles.heroSendBtn, (!input.trim() || ask.isPending) && { opacity: 0.4 }]}
              disabled={!input.trim() || ask.isPending}
              onPress={() => send()}
            >
              <Feather name="arrow-up" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.suggestLabel}>Hoặc thử hỏi</Text>
          {STARTER_QUESTIONS.map((q) => (
            <TouchableOpacity key={q} style={styles.suggestChip} onPress={() => send(q)}>
              <Text style={styles.suggestText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((m, i) => (
              <View key={i} style={m.role === 'user' ? styles.userBubble : styles.aiBubble}>
                {m.role === 'user' ? (
                  <Text style={styles.userText}>{m.text}</Text>
                ) : (
                  <MarkdownText text={m.text} style={styles.aiText} />
                )}
              </View>
            ))}
            {ask.isPending && (
              <View style={[styles.aiBubble, { paddingVertical: 8 }]}>
                <LottieThinking />
              </View>
            )}
            {ask.isError && <Text style={styles.errorText}>{(ask.error as Error).message}</Text>}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput
              ref={bottomInputRef}
              style={styles.input}
              placeholder="Nhập câu hỏi…"
              value={input}
              onChangeText={setInput}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || ask.isPending) && { opacity: 0.5 }]}
              disabled={!input.trim() || ask.isPending}
              onPress={() => send()}
            >
              <Text style={styles.sendText}>Gửi</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  heroScroll: { flexGrow: 1, padding: 20, paddingTop: 48, alignItems: 'stretch' },
  heroIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 8 },
  heroSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  heroInputBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroInput: { flex: 1, fontSize: 16, color: colors.text, maxHeight: 140, minHeight: 28 },
  heroSendBtn: {
    backgroundColor: colors.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 28,
    marginBottom: 10,
  },
  suggestChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  suggestText: { fontSize: 13, color: colors.text },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: 14,
    borderBottomRightRadius: 4,
    padding: 12,
    marginBottom: 8,
    maxWidth: '85%',
  },
  userText: { color: '#fff', fontSize: 14 },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    padding: 12,
    marginBottom: 8,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 8, textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    maxHeight: 90,
    fontSize: 14, color: colors.text,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendText: { color: '#fff', fontWeight: '700' },
});

export default function AiChat() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return (
    <AiGate projectId={projectId} title="Hỏi AI tư vấn" description="Gợi ý câu hỏi thông minh để hỏi thầu">
      <AiChatInner />
    </AiGate>
  );
}
