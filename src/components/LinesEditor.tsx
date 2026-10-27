import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { chf, parseAmount } from '@/lib/format';
import { totals, VAT_RATES, type Line, type Vat } from '@/lib/model';
import { uid } from '@/lib/storage';
import { Button, Card, Divider, IconButton, Muted, Row, Segmented, styles } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

/** Lignes (prix HT) + règle TVA stricte : Oui/Non par document ; Non → « TVA non applicable ». */
export function LinesEditor({ lines, onLines, vat, onVat, editable = true }: { lines: Line[]; onLines: (l: Line[]) => void; vat: Vat; onVat: (v: Vat) => void; editable?: boolean }) {
  const tt = totals(lines, vat);
  const upd = (id: string, p: Partial<Line>) => onLines(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  return (
    <>
      <Card>
        {lines.map((l, i) => (
          <View key={l.id}>
            {i > 0 ? <Divider /> : null}
            <TextInput editable={editable} value={l.description} onChangeText={(v) => upd(l.id, { description: v })} placeholder="Désignation" placeholderTextColor={t.muted} accessibilityLabel={`Désignation ligne ${i + 1}`} style={[styles.input, { marginTop: 8 }]} />
            <Row style={{ marginTop: 8, alignItems: 'center' }}>
              <AmountInput editable={editable} value={l.qty} onChange={(v) => upd(l.id, { qty: v })} label="Quantité" width={80} />
              <Text style={{ color: t.muted }}>×</Text>
              <AmountInput editable={editable} value={l.unitPrice} onChange={(v) => upd(l.id, { unitPrice: v })} label="Prix unitaire HT" width={110} />
              <Text style={{ color: t.text, flex: 1, textAlign: 'right', fontWeight: '600' }}>{chf(l.qty * l.unitPrice)}</Text>
              {editable ? <IconButton icon="trash-outline" label="Supprimer la ligne" color={t.danger} onPress={() => onLines(lines.filter((x) => x.id !== l.id))} /> : null}
            </Row>
          </View>
        ))}
        {editable ? <Button small variant="ghost" icon="add" title="Ajouter une ligne" style={{ marginTop: 10 }} onPress={() => onLines([...lines, { id: uid('l'), description: '', qty: 1, unitPrice: 0 }])} /> : null}
        <Muted style={{ marginTop: 6, fontSize: 12 }}>Prix unitaires saisis HT, en CHF.</Muted>
      </Card>
      <View style={{ height: 12 }} />
      <Segmented label="TVA sur ce document" options={[{ label: 'Non', value: 'non' }, { label: 'Oui', value: 'oui' }]} value={vat.apply ? 'oui' : 'non'} onChange={(v) => editable && onVat({ ...vat, apply: v === 'oui' })} />
      {vat.apply ? (
        <Segmented label="Taux" options={VAT_RATES.map((r) => ({ label: `${r.toFixed(1)} %`, value: r }))} value={vat.rate} onChange={(r) => editable && onVat({ ...vat, rate: r })} />
      ) : null}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><Muted>Total HT</Muted><Text style={{ color: t.text }}>{chf(tt.ht)}</Text></Row>
        <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <Muted>{vat.apply ? `TVA ${vat.rate.toFixed(1)} %` : 'TVA non applicable'}</Muted>
          <Text style={{ color: t.text }}>{vat.apply ? chf(tt.tva) : '—'}</Text>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: t.text, fontWeight: '700' }}>Total {vat.apply ? 'TTC' : ''}</Text><Text style={{ color: t.primary, fontWeight: '800', fontSize: 18 }}>{chf(tt.ttc)}</Text></Row>
      </Card>
    </>
  );
}

/** Saisie numérique tolérante (virgule, apostrophes) avec texte local. */
export function AmountInput({ value, onChange, label, width, editable = true }: { value: number; onChange: (n: number) => void; label: string; width?: number; editable?: boolean }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => {
    if (parseAmount(txt) !== value) setTxt(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <TextInput
      editable={editable}
      value={txt}
      onChangeText={(v) => {
        setTxt(v);
        const n = parseAmount(v);
        if (!Number.isNaN(n) && n >= 0) onChange(n);
      }}
      keyboardType="decimal-pad"
      accessibilityLabel={label}
      style={[styles.input, width ? { width } : { flex: 1 }]}
    />
  );
}
