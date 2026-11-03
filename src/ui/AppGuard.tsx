import { Component, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { reportCrash } from '@/lib/crash';
import { theme as t } from './theme';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    void reportCrash(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <BootFallback
        title="L’écran a rencontré une erreur"
        text="Vos données locales n’ont pas été effacées. Vous pouvez réessayer."
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

export function BootFallback({ title, text, onRetry }: { title: string; text?: string; onRetry?: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ActivityIndicator color={t.primary} />
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ color: t.muted, fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' }}>{text}</Text> : null}
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Réessayer"
          onPress={onRetry}
          style={{ marginTop: 20, minHeight: 48, minWidth: 44, paddingHorizontal: 18, borderRadius: 14, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: t.onPrimary, fontWeight: '700' }}>Réessayer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
