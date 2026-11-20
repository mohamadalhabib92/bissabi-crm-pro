import { useEffect, useState } from 'react';
import { loadArticles, saveArticle } from '@/lib/telephonie/api';
import { TelScreen, useTelephony } from '@/components/TeleShell';
import { Button, Card, Field, ListItem, Muted, Notice, Segmented } from '@/ui/kit';

const CATEGORIES = ['produits', 'tarifs', 'livraison', 'horaires', 'partenariats', 'sav', 'faq'] as const;

export default function KnowledgeScreen() {
  const tel = useTelephony();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadArticles>>>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('tarifs');
  const [language, setLanguage] = useState('fr');
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    if (!tel.client || !tel.ownerId) return;
    loadArticles(tel.client, tel.ownerId).then(setRows).catch((err: Error) => setError(err.message));
  };
  useEffect(refresh, [tel.client, tel.ownerId]);

  return (
    <TelScreen title={tel.t('knowledge')}>
      {error ? <Notice tone="danger" title="Base" text={error} /> : null}
      <Muted>L’assistante ne cite un prix que s’il est publié ici. Ne pas inventer de tarif dans le texte d’un autre article.</Muted>
      <Field label="Titre" value={title} onChangeText={setTitle} />
      <Segmented label="Catégorie" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ label: c, value: c }))} />
      <Field label="Langue" value={language} onChangeText={setLanguage} hint="fr, en, ar, de" />
      <Field label="Texte" value={body} onChangeText={setBody} multiline />
      <Button title={editing ? tel.t('save') : tel.t('publish')} onPress={() => {
        if (!tel.client || !tel.ownerId || !title.trim() || !body.trim()) return;
        saveArticle(tel.client, tel.ownerId, { id: editing, title: title.trim(), body, category, language, status: 'publie' })
          .then(() => { setTitle(''); setBody(''); setEditing(undefined); refresh(); })
          .catch((err: Error) => setError(err.message));
      }} />
      {rows.map((row) => (
        <Card key={row.id}>
          <ListItem
            title={row.title}
            subtitle={`${row.category} · ${row.language} · ${row.status}`}
            onPress={() => { setEditing(row.id); setTitle(row.title); setBody(row.body); setCategory(row.category as (typeof CATEGORIES)[number]); setLanguage(row.language); }}
          />
        </Card>
      ))}
      {!rows.length ? <Muted>{tel.t('empty')}</Muted> : null}
    </TelScreen>
  );
}