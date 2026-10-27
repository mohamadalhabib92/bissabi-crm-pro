import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '@/lib/data';
import { dateCH } from '@/lib/format';
import { DELIVERY_CANTON, STAGES, stageIndex, type Stage } from '@/lib/model';
import { Badge, Card, IconButton, Muted, Row, styles } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

/** Pipeline commercial (ordre fixe) : Prospect → Contacté → RDV/échantillon → Essai → Première commande → Client actif. */
export default function Pipeline() {
  const { accounts, setAccounts } = useData();
  const router = useRouter();
  const move = (id: string, dir: 1 | -1) =>
    setAccounts((l) => l.map((a) => { if (a.id !== id) return a; const i = stageIndex(a.etape) + dir; return i < 0 || i >= STAGES.length ? a : { ...a, etape: STAGES[i].key as Stage }; }));
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Muted style={{ paddingHorizontal: 20, paddingTop: 12 }}>Faites défiler horizontalement · flèches pour changer d’étape.</Muted>
      <ScrollView horizontal contentContainerStyle={{ padding: 16, gap: 12 }}>
        {STAGES.map((s, si) => {
          const col = accounts.filter((a) => a.etape === s.key);
          return (
            <View key={s.key} style={{ width: 260 }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: t.primary, fontWeight: '800' }}>{si + 1}. {s.label}</Text>
                <Badge label={String(col.length)} />
              </Row>
              <ScrollView style={{ maxHeight: 640 }}>
                {col.map((a) => (
                  <Card key={a.id} style={{ marginBottom: 8 }} onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })} accessibilityLabel={`Ouvrir ${a.nom}`}>
                    <Text style={[styles.h2, { fontSize: 16, marginBottom: 2 }]}>{a.nom}</Text>
                    <Muted>{a.ville} ({a.canton}) · {a.type}</Muted>
                    {a.prochaine_action ? <Muted style={{ fontSize: 13 }}>→ {a.prochaine_action}{a.prochaine_action_date ? ` · ${dateCH(a.prochaine_action_date)}` : ''}</Muted> : null}
                    <Row style={{ marginTop: 6, justifyContent: 'space-between', alignItems: 'center' }}>
                      <IconButton icon="chevron-back" label="Étape précédente" onPress={() => move(a.id, -1)} />
                      {a.canton !== DELIVERY_CANTON ? <Badge label="Hors zone" tone="warning" /> : a.demo ? <Badge label="démo" tone="warning" /> : <View />}
                      <IconButton icon="chevron-forward" label="Étape suivante" onPress={() => move(a.id, 1)} />
                    </Row>
                  </Card>
                ))}
                {!col.length ? <Muted style={{ fontSize: 13 }}>—</Muted> : null}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
