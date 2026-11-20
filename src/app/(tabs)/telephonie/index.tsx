import { useEffect, useState } from 'react';
import { ensureSettings, loadSettings, loadToday } from '@/lib/telephonie/api';
import { TelScreen, useTelephony } from '@/components/TeleShell';
import { Badge, Muted, Notice, Row, Spacer, Stat } from '@/ui/kit';

function seconds(value: number | null | undefined): string {
  if (value == null) return '—';
  const m = Math.floor(value / 60);
  const s = Math.round(value % 60);
  return `${m} min ${String(s).padStart(2, '0')} s`;
}

export default function TelephonieDashboard() {
  const tel = useTelephony();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof loadToday>> | null>(null);
  const [sandbox, setSandbox] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tel.client || !tel.ownerId) return;
    let alive = true;
    ensureSettings(tel.client, tel.ownerId)
      .then(() => Promise.all([loadToday(tel.client!, tel.ownerId!), loadSettings(tel.client!, tel.ownerId!)]))
      .then(([today, settings]) => {
        if (!alive) return;
        setStats(today);
        setSandbox(settings?.sandbox_mode !== false);
      })
      .catch((err: Error) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [tel.client, tel.ownerId]);

  return (
    <TelScreen title={tel.t('title')}>
      {sandbox ? <Badge label={tel.t('sandbox')} tone="warning" /> : null}
      <Spacer />
      {error ? <Notice tone="danger" title="Lecture impossible" text={error} /> : null}
      <Row wrap gap={10}>
        <Stat label={tel.t('calls')} value={String(stats?.appels ?? 0)} />
        <Stat label={tel.t('answerRate')} value={stats?.taux_decroche_pct == null ? '—' : `${stats.taux_decroche_pct} %`} />
      </Row>
      <Spacer h={10} />
      <Row wrap gap={10}>
        <Stat label={tel.t('conversion')} value={stats?.taux_conversion_pct == null ? '—' : `${stats.taux_conversion_pct} %`} />
        <Stat label={tel.t('meetings')} value={String(stats?.rdv_pris ?? 0)} />
      </Row>
      <Spacer h={10} />
      <Row wrap gap={10}>
        <Stat label={tel.t('duration')} value={seconds(stats?.duree_moyenne_s)} />
        <Stat label={tel.t('cost')} value={stats?.cout_par_appel_chf == null ? '—' : `CHF ${stats.cout_par_appel_chf}`} sub={stats?.cout_total_chf == null ? undefined : `Total CHF ${stats.cout_total_chf}`} />
      </Row>
      <Spacer />
      <Muted>Les appels du bac à sable sont exclus de ces chiffres. L’enregistrement audio est désactivé.</Muted>
    </TelScreen>
  );
}
