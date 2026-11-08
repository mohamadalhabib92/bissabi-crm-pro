import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking } from 'react-native';
import { AmountInput } from '@/components/LinesEditor';
import { confirmAsk } from '@/lib/confirm';
import { useData } from '@/lib/data';
import { dateCH, parseDate, todayISO } from '@/lib/format';
import { EXPENSE_CATEGORIES, type Attachment, type Expense } from '@/lib/model';
import { attachmentSubtitle, decideAttachment, shouldTryInline } from '@/lib/preserve';
import { uid } from '@/lib/storage';
import { Button, Card, Chip, DemoBanner, Field, ListItem, Muted, Notice, Row, Screen, Spacer } from '@/ui/kit';

async function toDataUrl(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { expenses, setExpenses } = useData();
  const router = useRouter();
  const nav = useNavigation();
  const existing = expenses.find((e) => e.id === id);
  const [e, setE] = useState<Expense>(existing ?? { id: uid('dep_'), date: todayISO(), category: EXPENSE_CATEGORIES[0], supplier: '', description: '', amountTTC: 0, vatAmount: 0 });
  const [dateTxt, setDateTxt] = useState(dateCH(e.date));
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  useEffect(() => nav.setOptions({ title: existing ? 'Dépense' : 'Nouvelle dépense' }), [nav, existing]);

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    let inlined: string | null = null;
    if (shouldTryInline(a.size)) {
      try {
        const dataUrl = await toDataUrl(a.uri);
        if (dataUrl.startsWith('data:')) inlined = dataUrl;
      } catch {
        // Conserve l’URI d’origine. L’app n’efface pas le fichier.
      }
    } else {
      setInfo('Fichier > 1,5 Mo : le contenu n’est pas copié dans les données. Archivez l’original séparément. L’app ne l’a pas effacé.');
    }
    const att = decideAttachment({ name: a.name, uri: a.uri, mime: a.mimeType, inlinedDataUrl: inlined }) as Attachment;
    if (att.persisted) setInfo('');
    else if (shouldTryInline(a.size)) setInfo('Le justificatif n’est pas copié dans les données. Si le lien vise un cache, il peut disparaître. L’app n’a pas effacé le fichier.');
    setE((x) => ({ ...x, attachment: att }));
  };

  const save = () => {
    const d = parseDate(dateTxt);
    if (!d) return setErr('Date invalide (JJ.MM.AAAA).');
    if (!(e.amountTTC > 0)) return setErr('Montant TTC obligatoire.');
    if (e.vatAmount > e.amountTTC) return setErr('La TVA ne peut pas dépasser le montant TTC.');
    const rec = { ...e, date: d };
    const wrote = setExpenses((l) => (l.some((x) => x.id === rec.id) ? l.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...l]));
    if (!wrote) return setErr('Rien n’a été écrit. Le justificatif déjà enregistré, s’il existe, est inchangé.');
    router.back();
  };

  const att = e.attachment;
  return (
    <Screen>
      {e.demo ? <DemoBanner text="Dépense d’exemple — non réelle." /> : null}
      <Field label="Date" value={dateTxt} onChangeText={setDateTxt} placeholder="JJ.MM.AAAA" />
      <Muted>Catégorie</Muted>
      <Row wrap style={{ marginVertical: 6 }}>
        {EXPENSE_CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={e.category === c} onPress={() => setE({ ...e, category: c })} />
        ))}
      </Row>
      <Field label="Fournisseur" value={e.supplier} onChangeText={(v) => setE({ ...e, supplier: v })} />
      <Field label="Description" value={e.description} onChangeText={(v) => setE({ ...e, description: v })} />
      <Row>
        <AmountInput label="Montant TTC (CHF)" value={e.amountTTC} onChange={(n) => setE({ ...e, amountTTC: n })} width={160} />
        <AmountInput label="dont TVA (CHF)" value={e.vatAmount} onChange={(n) => setE({ ...e, vatAmount: n })} width={140} />
      </Row>
      <Spacer />
      <Card>
        {att ? (
          <>
            <ListItem icon="attach-outline" title={att.name} subtitle={attachmentSubtitle(att)} onPress={() => void Linking.openURL(att.uri)} />
            {att.mime?.startsWith('image/') && att.persisted ? <Image source={{ uri: att.uri }} style={{ width: '100%', height: 180, borderRadius: 8 }} resizeMode="contain" /> : null}
            <Row>
              <Button small variant="ghost" icon="swap-horizontal" title="Remplacer" onPress={pick} />
              <Button small variant="ghost" icon="close" title="Retirer" onPress={() => setE({ ...e, attachment: undefined })} />
            </Row>
          </>
        ) : (
          <Button variant="secondary" icon="attach-outline" title="Joindre un justificatif (photo / PDF)" onPress={pick} />
        )}
      </Card>
      {info ? <Notice tone="warning" title={info} /> : null}
      {err ? <Notice tone="danger" title={err} /> : null}
      <Spacer />
      <Button title="Enregistrer" icon="checkmark" onPress={save} />
      {existing ? (
        <>
          <Spacer />
          <Button variant="danger" icon="trash-outline" title="Supprimer" onPress={() => confirmAsk('Supprimer la dépense ?', '', () => { if (setExpenses((l) => l.filter((x) => x.id !== e.id))) router.back(); else setErr('Rien n’a été écrit. Le justificatif déjà enregistré, s’il existe, est inchangé.'); })} />
        </>
      ) : null}
    </Screen>
  );
}
