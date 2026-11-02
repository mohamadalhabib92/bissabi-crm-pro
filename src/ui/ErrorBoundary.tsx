import { Component, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { reportCrash } from '@/lib/sentry';
import { Button } from './kit';
import { theme as t } from './theme';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Filet global : un écran d'erreur à la place d'un écran blanc, avec réessai. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    void reportCrash(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>
          L’écran a rencontré un problème
        </Text>
        <Text style={{ color: t.muted, fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 22 }}>
          Vos données sur l’appareil n’ont pas été effacées. Vous pouvez réessayer.
        </Text>
        <Button title="Réessayer" icon="refresh" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
