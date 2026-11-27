import { Platform, useWindowDimensions } from 'react-native';
import { isIosAppOnMac } from '@/lib/mac';
import { shellMetrics, type ShellMetrics } from '@/lib/shell';

export function useShell(): ShellMetrics & { mac: boolean; width: number } {
  const { width } = useWindowDimensions();
  const mac = isIosAppOnMac();
  return {
    ...shellMetrics({
      width,
      pad: Platform.OS === 'ios' && (Platform as { isPad?: boolean }).isPad === true,
      mac,
      web: Platform.OS === 'web',
    }),
    mac,
    width,
  };
}
