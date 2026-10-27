import { Alert, Platform } from 'react-native';
export function confirmAsk(title: string, msg: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || window.confirm(`${title}\n\n${msg}`)) onYes();
  } else Alert.alert(title, msg, [{ text: 'Annuler', style: 'cancel' }, { text: 'Confirmer', style: 'destructive', onPress: onYes }]);
}
