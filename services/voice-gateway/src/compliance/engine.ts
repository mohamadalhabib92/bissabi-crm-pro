import type { Holiday } from './holidays';

export type { Holiday };

export type DirectoryStatus = 'inconnu' | 'inscrit_ok' | 'inscrit_asterisque' | 'non_inscrit';
export type Relationship = 'prospect' | 'client_actif' | 'ancien_client' | 'partenaire';

export type TelSettings = {
  timezone: string;
  homeCanton: string;
  b2bOnly: boolean;
  sandboxMode: boolean;
  sandboxAllowlist: string[];
  directoryCheckMaxAgeDays: number;
};

export type ClientFacts = {
  id: string;
  type: string | null;
  canton: string | null;
  isB2b: boolean;
  relationship: Relationship;
  directoryStatus: DirectoryStatus;
  directoryCheckedAt: Date | null;
  doNotCall: boolean;
};

export type CallingWindow = {
  weekday: number;
  start: string;
  end: string;
  segment: 'horeca' | null;
  campaignId: string | null;
};

export type CheckRequest = {
  at: Date;
  phone: string;
  settings: TelSettings | null;
  client: ClientFacts | null;
  contactDoNotCall: boolean;
  onDnc: boolean;
  windows: CallingWindow[];
  holidays: { day: string; canton: string | null }[];
  campaignId?: string | null;
  /** false = campagne avec numéro non inscrit ; null = pas de campagne. */
  callerListed?: boolean | null;
};

export type CheckResult = { allowed: boolean; reason: string };

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function isHorecaType(type: string | null | undefined): boolean {
  return /restaurant|caf[eé]|horeca|\bbar\b|h[oô]tel/i.test(type ?? '');
}

export function zonedParts(at: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(at)) {
    if (p.type !== 'literal') bag[p.type] = p.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const minute = Number(bag.minute);
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  return {
    isoDow: WEEKDAY[bag.weekday] ?? 0,
    dateISO: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    minutes: hour * 60 + minute,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m ?? 0);
}

function inScope(window: CallingWindow, campaignId: string | null | undefined, windows: CallingWindow[]): boolean {
  if (campaignId) {
    const campaignHas = windows.some((w) => w.campaignId === campaignId);
    if (campaignHas) return window.campaignId === campaignId;
  }
  return window.campaignId == null;
}

function holidayHit(
  dateISO: string,
  holidays: { day: string; canton: string | null }[],
  clientCanton: string | null,
  homeCanton: string,
): boolean {
  const canton = clientCanton || homeCanton;
  return holidays.some((h) => h.day === dateISO && (h.canton == null || h.canton === canton || h.canton === homeCanton));
}

/** Miroir de public.tel_check_outbound. Le dialer appelle en plus la fonction SQL avant chaque composition. */
export function checkOutbound(req: CheckRequest): CheckResult {
  const { settings } = req;
  if (!settings) return { allowed: false, reason: 'parametres_absents' };
  const local = zonedParts(req.at, settings.timezone);

  if (settings.sandboxMode && !settings.sandboxAllowlist.includes(req.phone)) {
    return { allowed: false, reason: 'sandbox_numero_non_autorise' };
  }
  if (req.campaignId && !settings.sandboxMode && req.callerListed !== true) {
    return { allowed: false, reason: 'numero_appelant_non_inscrit' };
  }
  if (req.onDnc) return { allowed: false, reason: 'liste_ne_pas_appeler' };
  if (!req.client) return { allowed: false, reason: 'compte_introuvable' };
  if (req.client.doNotCall) return { allowed: false, reason: 'compte_ne_pas_appeler' };
  if (req.contactDoNotCall) return { allowed: false, reason: 'contact_ne_pas_appeler' };
  if (settings.b2bOnly && !req.client.isB2b) return { allowed: false, reason: 'non_b2b' };

  if (req.client.relationship === 'prospect') {
    if (req.client.directoryStatus !== 'inscrit_ok') {
      return { allowed: false, reason: `annuaire_${req.client.directoryStatus}` };
    }
    const cutoff = req.at.getTime() - settings.directoryCheckMaxAgeDays * 86_400_000;
    if (!req.client.directoryCheckedAt || req.client.directoryCheckedAt.getTime() < cutoff) {
      return { allowed: false, reason: 'verification_annuaire_perimee' };
    }
  }

  if (local.isoDow === 7) return { allowed: false, reason: 'dimanche' };
  if (holidayHit(local.dateISO, req.holidays, req.client.canton, settings.homeCanton)) {
    return { allowed: false, reason: 'jour_ferie' };
  }

  const scoped = req.windows.filter((w) => inScope(w, req.campaignId, req.windows));
  const horeca = isHorecaType(req.client.type) && scoped.some((w) => w.segment === 'horeca');
  const open = scoped.some((w) => {
    if (w.weekday !== local.isoDow) return false;
    const start = toMinutes(w.start);
    const end = toMinutes(w.end);
    if (local.minutes < start || local.minutes >= end) return false;
    return horeca ? w.segment === 'horeca' : w.segment == null;
  });
  if (!open) return { allowed: false, reason: local.isoDow === 6 ? 'samedi' : 'hors_plage_horaire' };
  return { allowed: true, reason: 'ok' };
}

/** Horaires uniquement : un appel déjà en cours n'est pas re-filtré par la DNC ni l'annuaire. */
export function checkTransferWindow(req: {
  at: Date;
  settings: TelSettings | null;
  windows: CallingWindow[];
  holidays: { day: string; canton: string | null }[];
  clientType?: string | null;
  canton?: string | null;
}): CheckResult {
  if (!req.settings) return { allowed: false, reason: 'parametres_absents' };
  return checkOutbound({
    at: req.at,
    phone: '+41000000000',
    settings: { ...req.settings, sandboxMode: false, b2bOnly: false },
    client: {
      id: 'transfer',
      type: req.clientType ?? null,
      canton: req.canton ?? null,
      isB2b: true,
      relationship: 'client_actif',
      directoryStatus: 'inscrit_ok',
      directoryCheckedAt: req.at,
      doNotCall: false,
    },
    contactDoNotCall: false,
    onDnc: false,
    windows: req.windows,
    holidays: req.holidays,
    campaignId: null,
    callerListed: null,
  });
}

export function defaultWindows(campaignId: string | null = null): CallingWindow[] {
  const out: CallingWindow[] = [];
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    out.push({ weekday, start: '09:00', end: '11:30', segment: null, campaignId });
    out.push({ weekday, start: '14:00', end: '17:30', segment: null, campaignId });
    out.push({ weekday, start: '14:30', end: '17:00', segment: 'horeca', campaignId });
  }
  return out;
}

export const PERMANENT_BLOCK_REASONS = new Set([
  'liste_ne_pas_appeler',
  'compte_ne_pas_appeler',
  'contact_ne_pas_appeler',
  'non_b2b',
  'annuaire_inconnu',
  'annuaire_inscrit_asterisque',
  'annuaire_non_inscrit',
  'verification_annuaire_perimee',
  'compte_introuvable',
  'numero_appelant_non_inscrit',
]);
