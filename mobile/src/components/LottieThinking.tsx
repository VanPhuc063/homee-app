import LottieView from 'lottie-react-native';
import { StyleSheet } from 'react-native';

/** 3 chấm nhấp nháy so le — "AI đang trả lời", thay cho ActivityIndicator tròn. */
export function LottieThinking({ width = 60 }: { width?: number }) {
  return (
    <LottieView
      source={require('../../assets/lottie/thinking.json')}
      autoPlay
      loop
      style={[styles.base, { width, height: (width / 120) * 40 }]}
    />
  );
}

const styles = StyleSheet.create({
  base: {},
});
