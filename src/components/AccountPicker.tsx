import { useState } from 'react';
import { Text } from 'react-native';
import { useData } from '@/lib/data';
import { Chip, Field, Row } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export function AccountPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { accounts } = useData();
  const [q, setQ] = useState('');
  const sel = accounts.find((a) => a.id === value);
  const list = accounts.filter((a) => !q || a.nom.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  return (
    <>
      <Text style={{ color: t.text, fontWeight: '600', marginBottom: 6 }}>Client {sel ? `· ${sel.nom}` : ''}</Text>
      {accounts.length > 8 ? <Field label="Rechercher un client" value={q} onChangeText={setQ} /> : null}
      <Row wrap>
        {list.map((a) => (
          <Chip key={a.id} label={a.nom} active={a.id === value} onPress={() => onChange(a.id)} />
        ))}
      </Row>
    </>
  );
}
