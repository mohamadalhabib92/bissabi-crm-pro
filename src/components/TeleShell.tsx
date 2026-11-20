import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { telTr, type TelLang } from '@/lib/telephonie/i18n';
import { getSupabase } from '@/lib/telephonie/supabase';
import { Button, Chip, Field, H1, Muted, Notice, Row, Screen, Spacer } from '@/ui/kit';

const LANG_KEY = 'bissabi.tel.lang';

export function useTelephony() {
  const client = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<TelLang>('fr');
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(LANG_KEY).then((value) => {
      if (alive && (value === 'fr' || value === 'en' || value === 'ar' || value === 'de')) setLangState(value);
    }).catch(() => undefined);
    if (!client) {
      setReady(true);
      return () => { alive = false; };
    }
    client.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  const setLang = (next: TelLang) => {
    setLangState(next);
    AsyncStorage.setItem(LANG_KEY, next).catch(() => undefined);
  };
  return {
    client, session, ready, configured: Boolean(client), lang, setLang,
    t: (key: Parameters<typeof telTr>[1]) => telTr(lang, key),
    ownerId: session?.user.id ?? null,
  };
}

const LINKS: { href: '/telephonie' | '/telephonie/journal' | '/telephonie/scripts' | '/telephonie/campagnes' | '/telephonie/dnc' | '/telephonie/connaissances'; key: Parameters<typeof telTr>[1] }[] = [
  { href: '/telephonie', key: 'dashboard' },
  { href: '/telephonie/journal', key: 'journal' },
  { href: '/telephonie/scripts', key: 'scripts' },
  { href: '/telephonie/campagnes', key: 'campaigns' },
  { href: '/telephonie/dnc', key: 'dnc' },
  { href: '/telephonie/connaissances', key: 'knowledge' },
];

export function TelScreen({ title, children }: { title?: string; children: ReactNode }) {
  const router = useRouter();
  const tel = useTelephony();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (!tel.client) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await tel.client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) setError(authError.message);
  };

  return (
    <Screen>
      <Row wrap>
        {(['fr', 'en', 'ar', 'de'] as TelLang[]).map((code) => (
          <Chip key={code} label={code.toUpperCase()} active={tel.lang === code} onPress={() => tel.setLang(code)} />
        ))}
      </Row>
      <Spacer h={8} />
      <Row wrap>
        {LINKS.map((link) => (
          <Button key={link.href} small variant="ghost" title={tel.t(link.key)} onPress={() => router.push(link.href)} />
        ))}
      </Row>
      <Spacer />
      {title ? <H1>{title}</H1> : null}
      {!tel.configured ? <Notice tone="warning" title={tel.t('notConfigured')} text="EXPO_PUBLIC_SUPABASE_URL · EXPO_PUBLIC_SUPABASE_ANON_KEY" /> : null}
      {tel.configured && !tel.ready ? <Muted>{tel.t('loading')}</Muted> : null}
      {tel.configured && tel.ready && !tel.session ? (
        <>
          <Field label={tel.t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Field label={tel.t('password')} value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Notice tone="danger" title={error} /> : null}
          <Button title={tel.t('signIn')} onPress={signIn} loading={busy} />
        </>
      ) : null}
      {tel.session ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>{tel.session.user.email}</Muted>
            <Button small variant="ghost" title={tel.t('signOut')} onPress={() => tel.client?.auth.signOut()} />
          </Row>
          <Spacer />
          {children}
        </>
      ) : null}
    </Screen>
  );
}
