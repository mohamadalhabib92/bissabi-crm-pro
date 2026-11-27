import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShell } from '@/lib/useShell';
import { theme as t } from '@/ui/theme';

export function DataTable({
  headers,
  rows,
}: {
  headers: { label: string; flex: number; align?: 'left' | 'right' }[];
  rows: { id: string; cells: ReactNode[]; onPress?: () => void; label: string; action?: ReactNode }[];
}) {
  const { typeScale } = useShell();
  const size = Math.round(15 * typeScale);
  const reserveAction = rows.some((row) => row.action);
  return (
    <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: t.radius, backgroundColor: t.surface, marginBottom: 12, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surfaceAlt }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
          {headers.map((header) => (
            <Text
              key={header.label}
              style={{ flex: header.flex, color: t.muted, fontSize: Math.round(12 * typeScale), fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', textAlign: header.align ?? 'left' }}
            >
              {header.label}
            </Text>
          ))}
        </View>
        {reserveAction ? <View style={{ width: 148 }} /> : null}
      </View>
      {rows.map((row, index) => (
        <TableRow key={row.id} row={row} headers={headers} size={size} first={index === 0} reserveAction={reserveAction} />
      ))}
    </View>
  );
}

function TableRow({
  row,
  headers,
  size,
  first,
  reserveAction,
}: {
  row: { cells: ReactNode[]; onPress?: () => void; label: string; action?: ReactNode };
  headers: { flex: number; align?: 'left' | 'right' }[];
  size: number;
  first: boolean;
  reserveAction: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const cells = (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8 }}>
      {row.cells.map((cell, index) => (
        <View key={headers[index] ? String(index) : index} style={{ flex: headers[index]?.flex ?? 1, alignItems: headers[index]?.align === 'right' ? 'flex-end' : 'flex-start' }}>
          {typeof cell === 'string' || typeof cell === 'number' ? (
            <Text numberOfLines={2} style={{ color: t.text, fontSize: size, fontWeight: index === 0 ? '700' : '400', textAlign: headers[index]?.align ?? 'left', fontVariant: headers[index]?.align === 'right' ? ['tabular-nums'] : undefined }}>
              {cell}
            </Text>
          ) : (
            cell
          )}
        </View>
      ))}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.border, backgroundColor: hovered ? t.surfaceAlt : 'transparent' }}>
      {row.onPress ? (
        <Pressable
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel={row.label}
          onPress={row.onPress}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
        >
          {cells}
        </Pressable>
      ) : (
        cells
      )}
      {reserveAction ? <View style={{ width: 148, paddingRight: 12, alignItems: 'flex-end' }}>{row.action}</View> : null}
    </View>
  );
}
